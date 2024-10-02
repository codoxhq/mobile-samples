import 'dart:async';
import 'dart:io';
// For jsonEncode
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle; // Import rootBundle
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'dart:convert'; // Add this for utf8 encoding

Future main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (Platform.isAndroid) {
    await AndroidInAppWebViewController.setWebContentsDebuggingEnabled(true);
  }

  runApp(
    MaterialApp(
      theme: ThemeData(useMaterial3: true),
      home: const MyWebViewPage(),
    ),
  );
}

class MyWebViewPage extends StatefulWidget {
  const MyWebViewPage({super.key});

  @override
  _MyWebViewPageState createState() => _MyWebViewPageState();
}

class _MyWebViewPageState extends State<MyWebViewPage> {
  late InAppWebViewController _webViewController;

  // Initial draft editor state - fetch it from backend
  Map<String, dynamic> initDraftStateRaw = {
    "blocks": [
      {
        "key": "cn93p",
        "text": "DEMO DOC TEXT",
        "type": "unstyled",
        "depth": 0,
        "inlineStyleRanges": [],
        "entityRanges": [],
        "data": {},
      }
    ],
    "entityMap": {}
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Flutter+Draft+Codox'),
      ),
      body: FutureBuilder<String>(
        future: _loadLocalHtml(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.done) {
            if (snapshot.hasData) {
              return InAppWebView(
                initialData: InAppWebViewInitialData(
                  data: snapshot.data!,
                  /**
                   * IMPORTANT:
                   *  Setting baseUrl is essential now for codox sync to work:
                   *  base url is considered by codox as "domain" which is allowed by codox subscription.
                   *  Example: codox subscription has whitelisted domain "flutter_demo.app", configured in codox dashboard,
                   *           then here need to specify baseUrl with http prefix, e.g. "http://flutter_demo.app"
                   *
                   */
                  baseUrl: Uri.parse("http://flutter_demo.app"),
                  mimeType: 'text/html',
                  encoding: 'utf-8',
                ),
                initialOptions: InAppWebViewGroupOptions(
                  crossPlatform: InAppWebViewOptions(
                    javaScriptEnabled:
                        true, // Important: this must be enabled for js to work in local html
                    useOnLoadResource: true,
                    allowUniversalAccessFromFileURLs: true,
                    allowFileAccessFromFileURLs: true,
                  ),
                ),
                onWebViewCreated: (controller) {
                  _webViewController = controller;

                  /**
                   * Add listeners to codox hooks:
                   * - contentUpdated hook
                   * - usersUpdate
                   * - fetchDocOnNetworkReconnectHook
                   *
                   * + add listener to codox errors
                   */

                  _webViewController.addJavaScriptHandler(
                      handlerName: "usersUpdateHookHandler",
                      callback: (args) {
                        String users = args[0];
                        print("[usersUpdateHookHandler]: $users");
                      });

                  _webViewController.addJavaScriptHandler(
                      handlerName: "contentChangedHookHandler",
                      callback: (args) {
                        String fullState = args[0];
                        print("[contentChangedHookHandler]: $fullState");
                      });

                  _webViewController.addJavaScriptHandler(
                      handlerName: "fetchDocOnNetworkReconnectHookHandler",
                      callback: (args) {
                        print(
                            "[fetchDocOnNetworkReconnectHookHandler] invoked");

                        // should fetch state from backend
                        // response must match schema:  {content, timestamp}
                        Map<String, dynamic> fetchedData = {
                          "content": {
                            "blocks": [
                              {
                                "key": "cn93p",
                                "text": "DEMO DOC TEXT",
                                "type": "unstyled",
                                "depth": 0,
                                "inlineStyleRanges": [],
                                "entityRanges": [],
                                "data": {},
                              }
                            ],
                            "entityMap": {}
                          },
                          "timestamp": -1
                        };
                        return fetchedData;
                      });

                  _webViewController.addJavaScriptHandler(
                      handlerName: "codoxErrorEventListener",
                      callback: (args) {
                        String data = args[0];
                        print("[codoxErrorEventListener]: $data");
                      });
                },
                onConsoleMessage: (controller, consoleMessage) {
                  /**
                   * Log all js logs into debug terminal
                   */
                  print('[DRAFT_BUILD]: ${consoleMessage.message}');
                },
                onLoadStop: (controller, url) async {
                  /**
                   * When page is fully loaded:
                   *  - inject js/css scripts
                   *  - init draft editor with codox 
                   * 
                   * Reason for separate injection of js/css is that when flutter loads local html with custom baseURL,
                   * the js/css are not loaded by default.
                   */
                  injectJsCss(controller);

                  // make a pause to ensure all js and css in injected
                  await Future.delayed(const Duration(
                      seconds: 2)); // Delay to ensure React components load

                  // init editor with codox with initial state
                  String initDraftStateJSON = jsonEncode(initDraftStateRaw);
                  await _webViewController.evaluateJavascript(
                      source: "window.initDraftEditor($initDraftStateJSON);");
                },
              );
            } else {
              return const Center(child: Text('Failed to load HTML content.'));
            }
          }
          return const Center(child: CircularProgressIndicator());
        },
      ),
    );
  }

  Future<String> _loadLocalHtml() async {
    try {
      // Load the local HTML file content
      final String htmlString =
          await rootBundle.loadString("assets/draft/index.html");
      if (htmlString.isEmpty) {
        throw Exception('HTML content is empty');
      }
      return htmlString;
    } catch (e) {
      print('Error loading HTML file: $e');
      return '';
    }
  }

  // Inject JS and CSS using JavaScript
  void injectJsCss(InAppWebViewController controller) async {
    // Inject the CSS file
    await controller.evaluateJavascript(source: """
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'file:///android_asset/flutter_assets/assets/draft/static/css/main.css'; // path to CSS
      document.head.appendChild(link);
    """);

    // Inject the JS file
    await controller.evaluateJavascript(source: """
      var script = document.createElement('script');
      script.src = 'file:///android_asset/flutter_assets/assets/draft/static/js/main.js'; // path to JS
      document.body.appendChild(script);
    """);
  }
}
