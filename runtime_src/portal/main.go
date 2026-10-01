package main

import (
	"archive/zip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"html"
	"io"
	"log"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const version = "3.2.2"

type PortalUser struct {
	ID        string   `json:"id"`
	Nome      string   `json:"nome"`
	Perfil    string   `json:"perfil"`
	Segmentos []string `json:"segmentos"`
	Codigo    string   `json:"codigo"`
	Ativo     bool     `json:"ativo"`
}

type Session struct {
	User    PortalUser
	Expires time.Time
}

type sheetRow struct{ Values map[string]string }

type wsXML struct {
	Rows []rowXML `xml:"sheetData>row"`
}
type rowXML struct {
	Cells []cellXML `xml:"c"`
}
type cellXML struct {
	Ref    string    `xml:"r,attr"`
	Type   string    `xml:"t,attr"`
	V      string    `xml:"v"`
	Inline inlineXML `xml:"is"`
}
type inlineXML struct {
	T string `xml:"t"`
}
type sstXML struct {
	Items []siXML `xml:"si"`
}
type siXML struct {
	T    string   `xml:"t"`
	Runs []runXML `xml:"r"`
}
type runXML struct {
	T string `xml:"t"`
}

var (
	baseDir       string
	dataPath      string
	accessesPath  string
	dataMu        sync.Mutex
	sessionMu     sync.Mutex
	sessions      = map[string]Session{}
	lastHeartbeat atomic.Int64
)

var publicFields = map[string]bool{
	"id": true, "titulo": true, "status": true, "prioridade": true, "responsavel": true, "segmento": true, "solicitante": true,
	"prazo": true, "descricao": true, "criadoEm": true, "atualizadoEm": true, "tipoSolicitacao": true,
	"objetivo": true, "publicoAlvo": true, "mensagemPrincipal": true, "canal": true, "slaDias": true,
	"prazoSLA": true, "prazoNegociado": true, "referencias": true, "anexos": true, "triagemStatus": true,
	"retornoSolicitante": true, "respostaSolicitante": true, "aprovacaoSolicitante": true, "motivoUrgencia": true,
	"distribuidoEm": true, "ajusteSolicitadoEm": true, "respondidoSolicitanteEm": true, "entregaEm": true,
	"entregaEnviadaEm": true, "aprovadoSolicitanteEm": true, "arquivosEntrega": true, "entregaMensagem": true,
	"recorrente": true, "recorrenciaFrequencia": true, "recorrenciaFim": true, "solicitanteNome": true,
	"avaliacaoNota": true, "avaliacaoComentario": true, "avaliadoEm": true,
}
var createFields = map[string]bool{
	"titulo": true, "tipoSolicitacao": true, "segmento": true, "objetivo": true, "publicoAlvo": true,
	"mensagemPrincipal": true, "canal": true, "prazo": true, "prioridade": true, "motivoUrgencia": true,
	"referencias": true, "slaDias": true, "prazoSLA": true, "aprovacaoSolicitante": true,
	"recorrente": true, "recorrenciaFrequencia": true, "recorrenciaFim": true, "solicitanteNome": true,
}
var updateFields = map[string]bool{
	"respostaSolicitante": true, "respondidoSolicitanteEm": true,
	"aprovacaoSolicitante": true, "aprovadoSolicitanteEm": true,
	"avaliacaoNota": true, "avaliacaoComentario": true, "avaliadoEm": true,
}

func main() {
	exe, _ := os.Executable()
	baseDir = filepath.Dir(exe)
	dataPath = filepath.Join(baseDir, "DADOS", "EVO_MKT_SOLICITACOES.xlsx")
	accessesPath = filepath.Join(baseDir, "storage", "portal", "acessos.json")
	_ = os.MkdirAll(filepath.Dir(accessesPath), 0755)
	_ = os.MkdirAll(filepath.Join(baseDir, "storage", "logs"), 0755)
	lf, _ := os.OpenFile(filepath.Join(baseDir, "storage", "logs", "portal-solicitante.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if lf != nil {
		log.SetOutput(lf)
		defer lf.Close()
	}
	if _, err := ensureUsers(); err != nil {
		log.Printf("users: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/heartbeat", heartbeatHandler)
	mux.HandleFunc("/api/portal/login", loginHandler)
	mux.HandleFunc("/api/portal/notices", noticesHandler)
	mux.HandleFunc("/api/portal/requests", requestsHandler)
	mux.HandleFunc("/api/portal/upload", uploadHandler)
	mux.HandleFunc("/api/portal/file", portalFileHandler)
	mux.HandleFunc("/api/data", restrictedUpdateHandler)
	mux.HandleFunc("/api/manager/notices", managerNoticesHandler)
	mux.HandleFunc("/manager-notices.html", managerNoticesPageHandler)
	mux.HandleFunc("/", staticHandler)

	ln, port, err := listenAvailable(3211, 3220)
	if err != nil {
		log.Fatal(err)
	}
	srv := &http.Server{Handler: securityHeaders(mux), ReadHeaderTimeout: 10 * time.Second, MaxHeaderBytes: 1 << 20}
	lastHeartbeat.Store(time.Now().Unix())
	if runtime.GOOS == "windows" {
		go func() {
			time.Sleep(500 * time.Millisecond)
			openApp(fmt.Sprintf("http://127.0.0.1:%d/solicitante.html", port))
		}()
		go autoShutdown(srv)
	}
	log.Printf("EVO MKT Portal restrito v%s em 127.0.0.1:%d", version, port)
	if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func listenAvailable(start, end int) (net.Listener, int, error) {
	for p := start; p <= end; p++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			return ln, p, nil
		}
	}
	return nil, 0, fmt.Errorf("nenhuma porta local disponível")
}
func autoShutdown(s *http.Server) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if time.Since(time.Unix(lastHeartbeat.Load(), 0)) > 90*time.Second {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			_ = s.Shutdown(ctx)
			cancel()
			return
		}
	}
}
func heartbeatHandler(w http.ResponseWriter, r *http.Request) {
	lastHeartbeat.Store(time.Now().Unix())
	writeJSON(w, 200, map[string]any{"ok": true, "version": version})
}

func staticHandler(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" {
		path = "solicitante.html"
	}
	allowed := map[string]string{"solicitante.html": "text/html; charset=utf-8", "portal.js": "application/javascript; charset=utf-8", "portal.css": "text/css; charset=utf-8"}
	ct, ok := allowed[path]
	if !ok {
		http.NotFound(w, r)
		return
	}
	fp := filepath.Join(baseDir, "web", path)
	if _, err := os.Stat(fp); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", ct)
	http.ServeFile(w, r, fp)
}

func ensureUsers() ([]PortalUser, error) {
	if b, err := os.ReadFile(accessesPath); err == nil {
		var u []PortalUser
		if json.Unmarshal(b, &u) == nil && len(u) > 0 {
			fixed := map[string]string{"coord-infantil": "INF-2601", "coord-iniciais": "INI-2602", "coord-finais": "FIN-2603", "coord-medio": "MED-2604", "auzilair": "AUZ-2605"}
			changed := false
			for i := range u {
				if c, ok := fixed[u[i].ID]; ok && u[i].Codigo != c {
					u[i].Codigo = c
					changed = true
				}
			}
			if changed {
				if nb, e := json.MarshalIndent(u, "", "  "); e == nil {
					_ = os.WriteFile(accessesPath, nb, 0600)
				}
			}
			return u, nil
		}
	}
	defs := []PortalUser{
		{ID: "coord-infantil", Nome: "Coordenação Infantil", Perfil: "COORDENACAO", Segmentos: []string{"Infantil"}, Codigo: "INF-2601", Ativo: true},
		{ID: "coord-iniciais", Nome: "Coordenação Anos Iniciais", Perfil: "COORDENACAO", Segmentos: []string{"Anos Iniciais"}, Codigo: "INI-2602", Ativo: true},
		{ID: "coord-finais", Nome: "Coordenação Anos Finais", Perfil: "COORDENACAO", Segmentos: []string{"Anos Finais"}, Codigo: "FIN-2603", Ativo: true},
		{ID: "coord-medio", Nome: "Coordenação Ensino Médio", Perfil: "COORDENACAO", Segmentos: []string{"Ensino Médio"}, Codigo: "MED-2604", Ativo: true},
		{ID: "auzilair", Nome: "Auzilair", Perfil: "COORDENACAO_ATENDIMENTO_GRAFICA", Segmentos: []string{"Infantil", "Gráfica Infantil"}, Codigo: "AUZ-2605", Ativo: true},
	}
	b, _ := json.MarshalIndent(defs, "", "  ")
	if err := os.WriteFile(accessesPath, b, 0600); err != nil {
		return nil, err
	}
	var txt strings.Builder
	txt.WriteString("EVO MKT — ACESSOS INICIAIS DO PORTAL\n\n")
	for _, u := range defs {
		fmt.Fprintf(&txt, "%s | %s | %s\n", u.Nome, strings.Join(u.Segmentos, ", "), u.Codigo)
	}
	_ = os.WriteFile(filepath.Join(filepath.Dir(accessesPath), "ACESSOS_INICIAIS.txt"), []byte(txt.String()), 0600)
	return defs, nil
}
func loadUsers() ([]PortalUser, error) { return ensureUsers() }
func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return strings.ToUpper(hex.EncodeToString(b))
}
func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return "evo-" + hex.EncodeToString(b)
}
func newToken() string { b := make([]byte, 24); _, _ = rand.Read(b); return hex.EncodeToString(b) }

type PortalNotice struct {
	ID        string   `json:"id"`
	Titulo    string   `json:"titulo"`
	Mensagem  string   `json:"mensagem"`
	Segmentos []string `json:"segmentos"`
	Ativo     bool     `json:"ativo"`
	CriadoEm  string   `json:"criadoEm"`
}

func noticesFilePath() string { return filepath.Join(baseDir, "storage", "portal", "avisos.json") }
func loadNotices() []PortalNotice {
	b, err := os.ReadFile(noticesFilePath())
	if err != nil {
		return []PortalNotice{}
	}
	var x []PortalNotice
	if json.Unmarshal(b, &x) != nil {
		return []PortalNotice{}
	}
	return x
}
func saveNotices(x []PortalNotice) error {
	_ = os.MkdirAll(filepath.Dir(noticesFilePath()), 0755)
	b, _ := json.MarshalIndent(x, "", "  ")
	return os.WriteFile(noticesFilePath(), b, 0600)
}
func noticeAllowed(u PortalUser, n PortalNotice) bool {
	if !n.Ativo {
		return false
	}
	if len(n.Segmentos) == 0 {
		return true
	}
	for _, ns := range n.Segmentos {
		if ns == "*" {
			return true
		}
		for _, us := range u.Segmentos {
			if strings.EqualFold(strings.TrimSpace(ns), strings.TrimSpace(us)) {
				return true
			}
		}
	}
	return false
}
func noticesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		methodNA(w)
		return
	}
	u, ok := auth(r)
	if !ok {
		errJSON(w, 401, fmt.Errorf("sessão expirada"))
		return
	}
	out := []PortalNotice{}
	for _, n := range loadNotices() {
		if noticeAllowed(u, n) {
			out = append(out, n)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CriadoEm > out[j].CriadoEm })
	writeJSON(w, 200, map[string]any{"rows": out})
}
func managerNoticesHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		writeJSON(w, 200, map[string]any{"rows": loadNotices()})
	case "POST":
		var in PortalNotice
		if !decodeJSON(w, r, &in) {
			return
		}
		if strings.TrimSpace(in.Titulo) == "" || strings.TrimSpace(in.Mensagem) == "" {
			errJSON(w, 400, fmt.Errorf("título e mensagem são obrigatórios"))
			return
		}
		if in.ID == "" {
			in.ID = newID()
		}
		if in.CriadoEm == "" {
			in.CriadoEm = time.Now().Format(time.RFC3339)
		}
		in.Ativo = true
		x := loadNotices()
		x = append(x, in)
		if err := saveNotices(x); err != nil {
			errJSON(w, 500, err)
			return
		}
		writeJSON(w, 201, in)
	case "DELETE":
		id := r.URL.Query().Get("id")
		x := loadNotices()
		out := x[:0]
		for _, n := range x {
			if n.ID != id {
				out = append(out, n)
			}
		}
		if err := saveNotices(out); err != nil {
			errJSON(w, 500, err)
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
	default:
		methodNA(w)
	}
}
func managerNoticesPageHandler(w http.ResponseWriter, r *http.Request) {
	page := `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>EVO MKT · Avisos do Portal</title><style>body{font-family:system-ui;background:#f5f6fa;margin:0;padding:28px;color:#2b2d3a}.box{max-width:720px;margin:auto;background:#fff;padding:24px;border-radius:18px;border:1px solid #e2e4ec}h1{color:#1e3a8a}label{font-weight:700;display:block;margin:12px 0 5px}input,textarea,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d8dce7;border-radius:10px}button{padding:10px 14px;border:0;border-radius:10px;background:#f5820b;color:#fff;font-weight:800;cursor:pointer;margin-top:12px}.item{padding:12px 0;border-bottom:1px solid #eee}.item button{background:#fff1ef;color:#a52f2f;margin:6px 0}.seg{font-size:12px;color:#6b6f80}</style><div class="box"><h1>Avisos do Portal</h1><p>Publique orientações para todas as coordenações ou para segmentos específicos.</p><form id="f"><label>Título</label><input name="titulo" required><label>Mensagem</label><textarea name="mensagem" rows="4" required></textarea><label>Segmento</label><select name="segmento"><option value="*">Todos</option><option>Infantil</option><option>Anos Iniciais</option><option>Anos Finais</option><option>Ensino Médio</option><option>Gráfica Infantil</option></select><button>Publicar aviso</button></form><h2>Avisos publicados</h2><div id="list"></div></div><script>async function load(){let r=await fetch('/api/manager/notices');let j=await r.json();list.innerHTML=(j.rows||[]).map(x=>'<div class="item"><b>'+x.titulo+'</b><div class="seg">'+((x.segmentos||[]).join(', ')||'Todos')+'</div><p>'+x.mensagem+'</p><button onclick="del(\''+x.id+'\')">Excluir</button></div>').join('')||'<p>Nenhum aviso.</p>'} async function del(id){if(!confirm('Excluir aviso?'))return;await fetch('/api/manager/notices?id='+encodeURIComponent(id),{method:'DELETE'});load()} f.onsubmit=async e=>{e.preventDefault();let d=Object.fromEntries(new FormData(f));let body={titulo:d.titulo,mensagem:d.mensagem,segmentos:[d.segmento]};let r=await fetch('/api/manager/notices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(r.ok){f.reset();load()}else alert(await r.text())};load()</script></html>`
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(page))
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		methodNA(w)
		return
	}
	var in struct {
		Codigo string `json:"codigo"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	users, err := loadUsers()
	if err != nil {
		errJSON(w, 500, err)
		return
	}
	code := strings.TrimSpace(strings.ToUpper(in.Codigo))
	for _, u := range users {
		if u.Ativo && strings.ToUpper(u.Codigo) == code {
			tok := newToken()
			sessionMu.Lock()
			sessions[tok] = Session{User: u, Expires: time.Now().Add(12 * time.Hour)}
			sessionMu.Unlock()
			writeJSON(w, 200, map[string]any{"token": tok, "user": u})
			return
		}
	}
	errJSON(w, 401, fmt.Errorf("código de acesso inválido"))
}
func auth(r *http.Request) (PortalUser, bool) {
	tok := r.Header.Get("X-Portal-Token")
	if tok == "" {
		return PortalUser{}, false
	}
	sessionMu.Lock()
	defer sessionMu.Unlock()
	s, ok := sessions[tok]
	if !ok || time.Now().After(s.Expires) {
		delete(sessions, tok)
		return PortalUser{}, false
	}
	return s.User, true
}
func allowedSegment(u PortalUser, seg string) bool {
	for _, s := range u.Segmentos {
		if strings.EqualFold(strings.TrimSpace(s), strings.TrimSpace(seg)) {
			return true
		}
	}
	return false
}

func requestsHandler(w http.ResponseWriter, r *http.Request) {
	u, ok := auth(r)
	if !ok {
		errJSON(w, 401, fmt.Errorf("sessão expirada"))
		return
	}
	switch r.Method {
	case "GET":
		rows, err := readRows()
		if err != nil {
			errJSON(w, 500, err)
			return
		}
		out := []map[string]string{}
		for _, row := range rows {
			if allowedSegment(u, row["segmento"]) {
				out = append(out, publicRow(row))
			}
		}
		writeJSON(w, 200, map[string]any{"rows": out})
	case "POST":
		var in map[string]any
		if !decodeJSON(w, r, &in) {
			return
		}
		seg := str(in["segmento"])
		if !allowedSegment(u, seg) {
			errJSON(w, 403, fmt.Errorf("segmento não autorizado"))
			return
		}
		if strings.TrimSpace(str(in["titulo"])) == "" || strings.TrimSpace(str(in["objetivo"])) == "" {
			errJSON(w, 400, fmt.Errorf("título e objetivo são obrigatórios"))
			return
		}
		if strings.EqualFold(str(in["prioridade"]), "URGENTE") && strings.TrimSpace(str(in["motivoUrgencia"])) == "" {
			errJSON(w, 400, fmt.Errorf("motivo da urgência é obrigatório"))
			return
		}
		now := time.Now().Format(time.RFC3339)
		row := map[string]string{"id": newID(), "titulo": str(in["titulo"]), "status": "AGUARDANDO TRIAGEM", "prioridade": str(in["prioridade"]), "segmento": seg, "prazo": str(in["prazo"]), "descricao": str(in["objetivo"]), "origem": "PORTAL_SOLICITANTE", "criadoEm": now, "atualizadoEm": now, "solicitante": u.Nome, "triagemStatus": "AGUARDANDO TRIAGEM", "gerenteTriagem": "Gerente de Marketing"}
		for k := range createFields {
			if v, exists := in[k]; exists {
				row[k] = str(v)
			}
		}
		if n := strings.TrimSpace(str(in["solicitanteNome"])); n != "" {
			row["solicitante"] = n
		}
		if row["aprovacaoSolicitante"] == "" {
			row["aprovacaoSolicitante"] = "PENDENTE"
		}
		if err := appendRow(row); err != nil {
			errJSON(w, 500, err)
			return
		}
		writeJSON(w, 201, publicRow(row))
	default:
		methodNA(w)
	}
}

func restrictedUpdateHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "PUT" {
		methodNA(w)
		return
	}
	u, ok := auth(r)
	if !ok {
		errJSON(w, 401, fmt.Errorf("sessão expirada"))
		return
	}
	if r.URL.Query().Get("module") != "solicitacoes" {
		errJSON(w, 403, fmt.Errorf("módulo não permitido"))
		return
	}
	id := r.URL.Query().Get("id")
	var in map[string]any
	if !decodeJSON(w, r, &in) {
		return
	}
	rows, err := readRows()
	if err != nil {
		errJSON(w, 500, err)
		return
	}
	found := false
	for _, row := range rows {
		if row["id"] != id {
			continue
		}
		if !allowedSegment(u, row["segmento"]) {
			errJSON(w, 403, fmt.Errorf("demanda de outro segmento"))
			return
		}
		current := strings.ToUpper(row["status"] + " " + row["triagemStatus"])
		if note := strings.TrimSpace(str(in["avaliacaoNota"])); note != "" {
			if !strings.Contains(current, "CONCLUÍDA") {
				errJSON(w, 409, fmt.Errorf("a avaliação só pode ser enviada após a conclusão"))
				return
			}
			n, e := strconv.Atoi(note)
			if e != nil || n < 1 || n > 5 {
				errJSON(w, 400, fmt.Errorf("avaliação deve estar entre 1 e 5"))
				return
			}
		}
		for k, v := range in {
			if updateFields[k] {
				row[k] = str(v)
			}
		}
		approval := strings.ToUpper(strings.TrimSpace(row["aprovacaoSolicitante"]))
		if approval == "APROVADO" {
			if !strings.Contains(current, "AGUARDANDO APROVAÇÃO") {
				errJSON(w, 409, fmt.Errorf("esta demanda não está aguardando aprovação"))
				return
			}
			row["status"] = "CONCLUÍDA"
			row["triagemStatus"] = "CONCLUÍDA"
			if row["aprovadoSolicitanteEm"] == "" {
				row["aprovadoSolicitanteEm"] = time.Now().Format(time.RFC3339)
			}
		} else if approval == "AJUSTES SOLICITADOS" {
			if !strings.Contains(current, "AGUARDANDO APROVAÇÃO") {
				errJSON(w, 409, fmt.Errorf("esta demanda não está aguardando aprovação"))
				return
			}
			row["status"] = "EM EXECUÇÃO"
			row["triagemStatus"] = "DISTRIBUÍDA"
			if row["respondidoSolicitanteEm"] == "" {
				row["respondidoSolicitanteEm"] = time.Now().Format(time.RFC3339)
			}
		} else if strings.TrimSpace(row["respostaSolicitante"]) != "" {
			if !(strings.Contains(current, "AGUARDANDO SOLICITANTE") || strings.Contains(current, "DEVOLVIDA PARA AJUSTES")) {
				errJSON(w, 409, fmt.Errorf("esta demanda não está aguardando resposta"))
				return
			}
			row["status"] = "EM ANÁLISE"
			row["triagemStatus"] = "EM TRIAGEM"
			if row["respondidoSolicitanteEm"] == "" {
				row["respondidoSolicitanteEm"] = time.Now().Format(time.RFC3339)
			}
		}
		row["atualizadoEm"] = time.Now().Format(time.RFC3339)
		found = true
		break
	}
	if !found {
		http.NotFound(w, r)
		return
	}
	if err := writeRows(rows); err != nil {
		errJSON(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		methodNA(w)
		return
	}
	u, ok := auth(r)
	if !ok {
		errJSON(w, 401, fmt.Errorf("sessão expirada"))
		return
	}
	id := r.URL.Query().Get("id")
	rows, err := readRows()
	if err != nil {
		errJSON(w, 500, err)
		return
	}
	var target map[string]string
	for _, row := range rows {
		if row["id"] == id {
			target = row
			break
		}
	}
	if target == nil {
		http.NotFound(w, r)
		return
	}
	if !allowedSegment(u, target["segmento"]) {
		errJSON(w, 403, fmt.Errorf("demanda de outro segmento"))
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 100<<20)
	if err := r.ParseMultipartForm(100 << 20); err != nil {
		errJSON(w, 400, fmt.Errorf("arquivo inválido ou muito grande"))
		return
	}
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		writeJSON(w, 200, map[string]any{"files": []string{}})
		return
	}
	dir := filepath.Join(baseDir, "ANEXOS", "SOLICITACOES", safePart(id))
	if err := os.MkdirAll(dir, 0755); err != nil {
		errJSON(w, 500, err)
		return
	}
	saved := []string{}
	for _, fh := range files {
		rel, err := saveUpload(dir, id, fh)
		if err != nil {
			errJSON(w, 500, err)
			return
		}
		saved = append(saved, rel)
	}
	existing := strings.TrimSpace(target["anexos"])
	parts := []string{}
	if existing != "" {
		for _, p := range strings.Split(existing, "|") {
			p = strings.TrimSpace(p)
			if p != "" {
				parts = append(parts, p)
			}
		}
	}
	parts = append(parts, saved...)
	target["anexos"] = strings.Join(parts, " | ")
	target["atualizadoEm"] = time.Now().Format(time.RFC3339)
	if err := writeRows(rows); err != nil {
		errJSON(w, 500, err)
		return
	}
	writeJSON(w, 200, map[string]any{"files": saved})
}
func portalFileHandler(w http.ResponseWriter, r *http.Request) {
	u, ok := auth(r)
	if !ok {
		errJSON(w, 401, fmt.Errorf("sessão expirada"))
		return
	}
	rel := filepath.ToSlash(strings.TrimSpace(r.URL.Query().Get("path")))
	if rel == "" || strings.Contains(rel, "..") || !strings.HasPrefix(rel, "ANEXOS/SOLICITACOES/") {
		errJSON(w, 400, fmt.Errorf("arquivo inválido"))
		return
	}
	rows, err := readRows()
	if err != nil {
		errJSON(w, 500, err)
		return
	}
	allowed := false
	for _, row := range rows {
		if !allowedSegment(u, row["segmento"]) {
			continue
		}
		refs := row["anexos"] + " | " + row["arquivosEntrega"]
		for _, x := range strings.Split(refs, "|") {
			if filepath.ToSlash(strings.TrimSpace(x)) == rel {
				allowed = true
				break
			}
		}
		if allowed {
			break
		}
	}
	if !allowed {
		errJSON(w, 403, fmt.Errorf("arquivo não autorizado"))
		return
	}
	fp := filepath.Clean(filepath.Join(baseDir, filepath.FromSlash(rel)))
	base := filepath.Clean(filepath.Join(baseDir, "ANEXOS", "SOLICITACOES"))
	if !strings.HasPrefix(strings.ToLower(fp), strings.ToLower(base)+string(os.PathSeparator)) {
		errJSON(w, 403, fmt.Errorf("arquivo não autorizado"))
		return
	}
	if _, err := os.Stat(fp); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", filepath.Base(fp)))
	http.ServeFile(w, r, fp)
}

func saveUpload(dir, id string, fh *multipart.FileHeader) (string, error) {
	src, err := fh.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()
	name := safePart(filepath.Base(fh.Filename))
	if name == "" {
		name = "arquivo"
	}
	dst := filepath.Join(dir, name)
	if _, err := os.Stat(dst); err == nil {
		ext := filepath.Ext(name)
		base := strings.TrimSuffix(name, ext)
		name = fmt.Sprintf("%s_%d%s", base, time.Now().UnixNano(), ext)
		dst = filepath.Join(dir, name)
	}
	out, err := os.Create(dst)
	if err != nil {
		return "", err
	}
	_, cpErr := io.Copy(out, src)
	clErr := out.Close()
	if cpErr != nil {
		return "", cpErr
	}
	if clErr != nil {
		return "", clErr
	}
	return filepath.ToSlash(filepath.Join("ANEXOS", "SOLICITACOES", id, name)), nil
}

func publicRow(row map[string]string) map[string]string {
	out := map[string]string{}
	for k := range publicFields {
		if v, ok := row[k]; ok {
			out[k] = v
		}
	}
	return out
}
func str(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case bool:
		if x {
			return "true"
		}
		return "false"
	default:
		b, _ := json.Marshal(x)
		return string(b)
	}
}
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		errJSON(w, 400, fmt.Errorf("JSON inválido"))
		return false
	}
	return true
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func errJSON(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
func methodNA(w http.ResponseWriter) { errJSON(w, 405, fmt.Errorf("método não permitido")) }

func readRows() ([]map[string]string, error) {
	dataMu.Lock()
	defer dataMu.Unlock()
	return readRowsUnlocked()
}
func appendRow(row map[string]string) error {
	dataMu.Lock()
	defer dataMu.Unlock()
	rows, err := readRowsUnlocked()
	if err != nil {
		return err
	}
	rows = append(rows, row)
	return writeRowsUnlocked(rows)
}
func writeRows(rows []map[string]string) error {
	dataMu.Lock()
	defer dataMu.Unlock()
	return writeRowsUnlocked(rows)
}

func readRowsUnlocked() ([]map[string]string, error) {
	zr, err := zip.OpenReader(dataPath)
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	var sheet, shared []byte
	for _, f := range zr.File {
		switch f.Name {
		case "xl/worksheets/sheet1.xml":
			sheet, _ = readZipFile(f)
		case "xl/sharedStrings.xml":
			shared, _ = readZipFile(f)
		}
	}
	if len(sheet) == 0 {
		return nil, fmt.Errorf("sheet1.xml ausente")
	}
	var ws wsXML
	if err := xml.Unmarshal(sheet, &ws); err != nil {
		return nil, err
	}
	ss := parseShared(shared)
	matrix := [][]string{}
	maxCol := 0
	for _, r := range ws.Rows {
		vals := map[int]string{}
		for _, c := range r.Cells {
			idx := colIndex(c.Ref)
			if idx > maxCol {
				maxCol = idx
			}
			v := c.V
			if c.Type == "s" {
				if n, e := strconv.Atoi(v); e == nil && n >= 0 && n < len(ss) {
					v = ss[n]
				}
			} else if c.Type == "inlineStr" {
				v = c.Inline.T
			}
			vals[idx] = v
		}
		row := make([]string, maxCol+1)
		for i, v := range vals {
			if i >= len(row) {
				tmp := make([]string, i+1)
				copy(tmp, row)
				row = tmp
			}
			row[i] = v
		}
		matrix = append(matrix, row)
	}
	if len(matrix) == 0 {
		return []map[string]string{}, nil
	}
	headers := matrix[0]
	out := []map[string]string{}
	for _, r := range matrix[1:] {
		m := map[string]string{}
		nonempty := false
		for i, h := range headers {
			if h == "" {
				continue
			}
			v := ""
			if i < len(r) {
				v = r[i]
			}
			m[h] = v
			if strings.TrimSpace(v) != "" {
				nonempty = true
			}
		}
		if nonempty && strings.TrimSpace(m["id"]) != "" {
			out = append(out, m)
		}
	}
	return out, nil
}
func readZipFile(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}
func parseShared(b []byte) []string {
	if len(b) == 0 {
		return nil
	}
	var s sstXML
	if xml.Unmarshal(b, &s) != nil {
		return nil
	}
	out := make([]string, 0, len(s.Items))
	for _, it := range s.Items {
		v := it.T
		for _, r := range it.Runs {
			v += r.T
		}
		out = append(out, v)
	}
	return out
}
func colIndex(ref string) int {
	n := 0
	for _, ch := range ref {
		if ch >= 'A' && ch <= 'Z' {
			n = n*26 + int(ch-'A'+1)
		} else if ch >= 'a' && ch <= 'z' {
			n = n*26 + int(ch-'a'+1)
		} else {
			break
		}
	}
	return n - 1
}
func colName(idx int) string {
	idx++
	s := ""
	for idx > 0 {
		idx--
		s = string(rune('A'+idx%26)) + s
		idx /= 26
	}
	return s
}

func writeRowsUnlocked(rows []map[string]string) error {
	zr, err := zip.OpenReader(dataPath)
	if err != nil {
		return err
	}
	defer zr.Close()
	headers := existingHeaders(zr)
	seen := map[string]bool{}
	for _, h := range headers {
		seen[h] = true
	}
	preferred := []string{"id", "titulo", "status", "prioridade", "responsavel", "segmento", "dataInicio", "prazo", "descricao", "tags", "origem", "idExterno", "ultimaSincronizacao", "criadoEm", "atualizadoEm", "solicitante", "tipoSolicitacao", "objetivo", "publicoAlvo", "mensagemPrincipal", "canal", "motivoUrgencia", "slaDias", "prazoSLA", "prazoNegociado", "referencias", "anexos", "triagemStatus", "gerenteTriagem", "retornoSolicitante", "respostaSolicitante", "aprovacaoSolicitante", "distribuidoEm", "ajusteSolicitadoEm", "respondidoSolicitanteEm", "entregaEm", "aprovadoSolicitanteEm", "arquivosEntrega", "entregaMensagem", "convertidoTipo", "convertidoId", "recorrente", "recorrenciaFrequencia", "recorrenciaFim", "solicitanteNome", "avaliacaoNota", "avaliacaoComentario", "avaliadoEm"}
	for _, h := range preferred {
		for _, r := range rows {
			if _, ok := r[h]; ok && !seen[h] {
				headers = append(headers, h)
				seen[h] = true
				break
			}
		}
	}
	extra := []string{}
	for _, r := range rows {
		for k := range r {
			if !seen[k] {
				extra = append(extra, k)
				seen[k] = true
			}
		}
	}
	sort.Strings(extra)
	headers = append(headers, extra...)
	sheet := buildSheet(headers, rows)
	tmp := dataPath + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(out)
	for _, f := range zr.File {
		hdr := f.FileHeader
		w, err := zw.CreateHeader(&hdr)
		if err != nil {
			zw.Close()
			out.Close()
			return err
		}
		if f.Name == "xl/worksheets/sheet1.xml" {
			_, err = w.Write(sheet)
		} else {
			rc, e := f.Open()
			if e != nil {
				return e
			}
			_, err = io.Copy(w, rc)
			rc.Close()
		}
		if err != nil {
			return err
		}
	}
	if err := zw.Close(); err != nil {
		out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	if err := backupData(); err != nil {
		log.Printf("backup: %v", err)
	}
	if runtime.GOOS == "windows" {
		_ = os.Remove(dataPath)
	}
	return os.Rename(tmp, dataPath)
}
func existingHeaders(zr *zip.ReadCloser) []string {
	var sheet []byte
	for _, f := range zr.File {
		if f.Name == "xl/worksheets/sheet1.xml" {
			sheet, _ = readZipFile(f)
			break
		}
	}
	var ws wsXML
	if xml.Unmarshal(sheet, &ws) != nil || len(ws.Rows) == 0 {
		return []string{"id", "titulo", "status", "prioridade", "responsavel", "segmento", "dataInicio", "prazo", "descricao", "tags", "origem", "idExterno", "ultimaSincronizacao", "criadoEm", "atualizadoEm"}
	}
	cells := ws.Rows[0].Cells
	headers := make([]string, 0, len(cells))
	for _, c := range cells {
		headers = append(headers, c.V)
	}
	return headers
}
func buildSheet(headers []string, rows []map[string]string) []byte {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="utf-8"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetFormatPr defaultRowHeight="15" /><x:sheetData>`)
	writeRow := func(n int, vals []string, style string) {
		fmt.Fprintf(&b, `<x:row r="%d">`, n)
		for i, v := range vals {
			ref := fmt.Sprintf("%s%d", colName(i), n)
			if v == "" {
				fmt.Fprintf(&b, `<x:c r="%s" s="%s" />`, ref, style)
			} else {
				fmt.Fprintf(&b, `<x:c r="%s" s="%s" t="str"><x:v>`, ref, style)
				var eb strings.Builder
				_ = xml.EscapeText(&eb, []byte(v))
				b.WriteString(eb.String())
				b.WriteString(`</x:v></x:c>`)
			}
		}
		b.WriteString(`</x:row>`)
	}
	writeRow(1, headers, "10")
	for i, r := range rows {
		vals := make([]string, len(headers))
		for j, h := range headers {
			vals[j] = r[h]
		}
		writeRow(i+2, vals, "11")
	}
	b.WriteString(`</x:sheetData></x:worksheet>`)
	return []byte(b.String())
}
func backupData() error {
	dir := filepath.Join(baseDir, "backups", "portal-auto")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	src, err := os.Open(dataPath)
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.Create(filepath.Join(dir, "SOLICITACOES_"+time.Now().Format("20060102_150405.000")+".xlsx"))
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, src)
	return err
}
func safePart(s string) string {
	s = filepath.Base(strings.TrimSpace(s))
	s = strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' {
			return '_'
		}
		return r
	}, s)
	return s
}

func openApp(url string) {
	candidates := []string{filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"), filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"), filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"), filepath.Join(os.Getenv("ProgramFiles(x86)"), "Google", "Chrome", "Application", "chrome.exe")}
	profile := filepath.Join(baseDir, "storage", "portal-browser-profile")
	_ = os.MkdirAll(profile, 0755)
	for _, c := range candidates {
		if c != "" {
			if _, err := os.Stat(c); err == nil {
				_ = exec.Command(c, "--app="+url, "--user-data-dir="+profile, "--no-first-run", "--disable-extensions").Start()
				return
			}
		}
	}
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

// html package kept linked deliberately for a minimal safe standard-library dependency set.
var _ = html.EscapeString
