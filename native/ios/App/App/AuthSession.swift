import UIKit
import Capacitor
import AuthenticationServices

// Google refuses to sign in inside a web view, so sign-in runs in the system sheet
// («Карточки» wants to use supabase.co to sign in) and hands the callback URL back to the page.
@objc(AuthSessionPlugin)
public class AuthSessionPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "AuthSessionPlugin"
    public let jsName = "AuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]
    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let url = URL(string: call.getString("url") ?? ""), let scheme = call.getString("scheme") else {
            call.reject("url and scheme are required")
            return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                self.session = nil
                if let callback {
                    call.resolve(["url": callback.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("Sign-in canceled", "CANCELED")
                } else {
                    call.reject(error?.localizedDescription ?? "Sign-in failed")
                }
            }
            session.presentationContextProvider = self
            self.session = session
            session.start()
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.webView?.window ?? ASPresentationAnchor()
    }
}

// The app's screen: Capacitor's web view plus the plugins that live in this project.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AuthSessionPlugin())
        bridge?.registerPluginInstance(FeedbackPlugin())
    }
}
