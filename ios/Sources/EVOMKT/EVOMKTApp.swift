import SwiftUI
import WebKit

/// Endereço do EVO MKT em produção. O app não guarda senhas nem dados: só abre o site (login individual, permissões no servidor).
private let enderecoEVO = URL(string: "https://evomkt.antoniopfd.com")!

struct EVOWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // mantém a sessão entre aberturas
        let web = WKWebView(frame: .zero, configuration: config)
        web.allowsBackForwardNavigationGestures = true
        web.scrollView.contentInsetAdjustmentBehavior = .automatic
        web.load(URLRequest(url: enderecoEVO))
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {}
}

@main
struct EVOMKTApp: App {
    var body: some Scene {
        WindowGroup {
            EVOWebView().ignoresSafeArea(.container, edges: .bottom)
        }
    }
}
