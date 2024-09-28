import UIKit
import WebKit
import Foundation

// main class
class ViewController: UIViewController {
    
    @IBOutlet weak var webView: WKWebView!
    
    /*
     in real app, should fetch init content from backend
     */
    var initEditorState:String = '{"root":{"children":[{"children":[],"direction":"ltr","format":"","indent":0,"type":"paragraph","version":1,"textFormat":0}],"direction":"ltr","format":"","indent":0,"type":"root","version":1},"commentThreads":[]}'
   

    
    override func viewDidLoad() {
        super.viewDidLoad()
        // create web view
        setupWebView()
        // load html with editor
        loadLexicalEditor()
        
    
        
    }
   
    
    // this fn will be invoked as soon as webview is fully loaded and ready
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        /*
            When page is fully loaded to the following is strict sequence:
             1. inject codox lib into page
             2. set init editor state
             3. start codox sync
        */

        // inject js/css scripts to html
        injectJsCss()
        
        // pause to ensure all js/css is injected
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            // do proceed 2 seconds later

            // init editor with state
            initLexicalEditor(initEditorState)
        }
    
        
    }
    
    func injectJsCss() {
        /*
         Inject js code and css styles.
         Reason: when loading local html with custom baseURL via .loadHTMLString(), the local js scripts and css styles are
                 not attached. Custom baseURL is needed for codox subscription auth.
        */

        // inject javascript
        if let codoxJSPath = Bundle.main.path(forResource: "LexicalEditor/static/js/main", ofType: "js"),
            let jsContent = try? String(contentsOfFile: codoxJSPath, encoding: .utf8) {
                webView.evaluateJavaScript(jsContent)
            }

        // inject css styles
         if let cssPath = Bundle.main.path(forResource: "LexicalEditor/static/css/main", ofType: "css") {
            let cssURL = URL(fileURLWithPath: cssPath)
            let cssFileURLString = cssURL.absoluteString
            
            let jsCode = """
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '\(cssFileURLString)';
            document.head.appendChild(link);
            """
            
            webView.evaluateJavaScript(jsCode)
    }
    
    func setupPipeJSLogs() {
        /*
            This is a workaround to pipe js logs directly to swift terminal without using Safari debugging tools.
            Reason to have this here: with custom baseURL, unable to use Safari tools for debugging
        */
        webView.configuration.userContentController.add(self, name: "jsLogsPipeHandler")
        let jsCode = """
        (function() {
            // decorate native js logs
            var nativeConsoleLog = console.log;
            console.log = function(...args) {
                window.webkit.messageHandlers.jsLogsPipeHandler.postMessage(JSON.stringify(args))
                nativeConsoleLog.apply(console, arguments)
            }
            // decorate native js error logs
            var nativeConsoleError = console.error
            console.error = function(msg) {
                window.webkit.messageHandlers.jsLogsPipeHander.postMessage(JSON.stringify(args))
                nativeConsoleError.apply(console, arguments)
            }
        })()
        """
        let jsScript = WKUserScript(source: jsCode, injectionTime: .atDocumentStart,
                                    forMainFrameOnly: false)
        webView.configuration.userContentController.addUserScript(jsScript)   
    }

    
    func setupWebView() {
        let viewportScriptString = "var meta = document.createElement('meta'); meta.setAttribute('name', 'viewport'); meta.setAttribute('content', 'width=device-width'); meta.setAttribute('initial-scale', '1.0'); meta.setAttribute('maximum-scale', '1.0'); meta.setAttribute('minimum-scale', '1.0'); meta.setAttribute('user-scalable', 'no'); document.getElementsByTagName('head')[0].appendChild(meta);"

        let disableSelectionScriptString = "document.documentElement.style.webkitUserSelect='none';"

        let disableCalloutScriptString = "document.documentElement.style.webkitTouchCallout='none';"
        let viewportScript = WKUserScript(source: viewportScriptString, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        let disableSelectionScript = WKUserScript(source: disableSelectionScriptString, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        let disableCalloutScript = WKUserScript(source: disableCalloutScriptString, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        
        webView.navigationDelegate = self
        webView.isInspectable = true
        webView.configuration.userContentController.addUserScript(viewportScript)
        webView.configuration.userContentController.addUserScript(disableSelectionScript)
        webView.configuration.userContentController.addUserScript(disableCalloutScript)
        
        // define handler for codox hooks and error events
        webView.configuration.userContentController.add(self, name: "contentChanged")
        webView.configuration.userContentController.add(self, name: "usersUpdate")
        webView.configuration.userContentController.add(self, name: "fetchDocOnNetworkReconnect")
        webView.configuration.userContentController.add(self, name: "onCodoxError")
        webView.configuration.userContentController.add(self, name: "onBlacklistedInsert")
        setupPipeJSLogs()
    }

    // load local html file
    func loadLexicalEditor() {
        if let htmlFilePath = Bundle.main.path(forResource: "index", ofType: "html", inDirectory: "LexicalEditor") {
            do {
                
                let htmlContent = try String(contentsOfFile: htmlFilePath)
              
                /**
                * IMPORTANT:
                *  Setting baseUrl is critical now for codox sync to work:
                *  base url is considered by codox as "domain" which is allowed by codox subscription.
                *  Example: codox subscription has whitelisted domain "swift_demo.app", configured in codox dashboard,
                *           then here need to specify baseUrl with http prefix, like "http://swift_demo.app"
                */
                let baseUrl = URL(string: "http://swift_demo.app/")
                webView.loadHTMLString(htmlContent, baseURL: baseUrl)
            } catch {
                print("Error loading HTML: \(error)")
            }    
        }  
    }
    
    func initLexicalEditor(initEditorState) {
        let jsCode = "window.initLexicalEditor(\(initEditorState));"
        webView.evaluateJavaScript(jsCode) { (result, error) in
            if let error = error {
                print("js invoking initLexicalEditor error: \(error)")
            }
        }
    }
    
  
}
//webview deleagate
extension ViewController : WKNavigationDelegate, WKScriptMessageHandler {
    
    /**
        Handle content messages from JavaScript
    **/
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
       
        
        if message.name == "contentChanged", let content = message.body as? String {
            // Handle the contentUpdated hook from codox - content is json here
            print("[Codox contentChanged hook] content json: \(content)")
            //  do any custom actions here, e.g. write to db
        }   
            
        
        if message.name == "usersUpdate", let users = message.body as? String {
            // handle usersUpdate hook from codox - users is json here
            print("[Codox usersUpdate hook] users update: \(users)")
        }
        
        if message.name == "fetchDocOnNetworkReconnect" {
            print("[Codox fetchDocOnNetworkReconnect hook] invoked")
            /**
                NOTE: by design of communication between js and swift, 
                js does not wait for response from swift here, that's why
                here, when swift needs to pass back response to js, it invokes another
                method which is processed by js. In js code it is coded as if js is waiting for response (using lang specific features)
            **/
            // should return lexical state from backend here
            /* Fetched content must match pattern {content: {...}, timestamp}
             * Should pass it back to js as JSON
               Here for demo, mocking fetched state:
             */
            do {
                let json: String = '{"content":{"root":{"children":[{"children":[],"direction":"ltr","format":"","indent":0,"type":"paragraph","version":1,"textFormat":0}],"direction":"ltr","format":"","indent":0,"type":"root","version":1},"commentThreads":[]},"timestamp":-1}'
                let jsCode = "window.fetchDocOnReconnectHookResponse(\(json));"
                webView.evaluateJavaScript(jsCode)
                
            } catch {
                print("FetchedDocOnReconnect error: \(error)")
            }
        }
        
        if message.name == "onCodoxError", let errorData = message.body as? String {
            // handle codox errors - any custom logic here - errorData is json here
            print("[Codox Error Event]: \(errorData)")
        }

        if message.name == "onBlacklistedInsert" {
            // handle blacklisted cases - any custom logic here, e.g. show some ui message
            print("Blacklisted content detected")
        }

        
        // listen to js logs - simply print with prefix
        if message.name == "jsLogsPipeHandler" {
            if let logMessage = message.body as? String {
                print("[JS LOGS]: \(logMessage)")
            }
        }
    }
}



