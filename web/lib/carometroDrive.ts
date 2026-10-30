/**
 * Pastas do Google Drive (Carômetro). Nesta fase a integração NÃO é operacional: guarda-se só a referência da pasta
 * (o identificador, nunca credenciais) e a conferência é manual. O contrato abaixo é o que uma integração futura implementaria
 * (somente leitura, com a pasta escolhida por um Administrador); o Carômetro nunca depende dele para consultar dados locais.
 */
export interface DriveProvider {
  /** Lista imagens da pasta (somente leitura). Deve falhar com erro claro se a permissão não for confirmada. */
  listar(pastaId: string): Promise<{ id: string; nome: string; tamanho: number }[]>;
  baixar(arquivoId: string): Promise<Buffer>;
}
export const DRIVE_ESTADO_INTEGRACAO = 'nao_operacional' as const;

/** Aceita o link da pasta (drive.google.com/drive/folders/ID) ou o próprio ID. Qualquer outro endereço é recusado. */
export function pastaDriveId(entrada: string): string | null {
  const s = String(entrada ?? '').trim();
  if (/^[A-Za-z0-9_-]{10,80}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.hostname !== 'drive.google.com') return null;
    const m = /^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,80})\/?$/.exec(u.pathname);
    return m ? m[1] : null;
  } catch { return null; }
}
export const linkPastaDrive = (id: string) => `https://drive.google.com/drive/folders/${id}`;
