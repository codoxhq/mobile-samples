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

  // Initial quill editor state - fetch it from backend
  Map<String, dynamic> initLexicalStateRaw = {
    "root": {
      "children": [
        {
          "children": [],
          "direction": 'ltr',
          "format": '',
          "indent": 0,
          "type": 'paragraph',
          "version": 1,
          "textFormat": 0,
        },
      ],
      "direction": 'ltr',
      "format": '',
      "indent": 0,
      "type": 'root',
      "version": 1,
    },
    "commentThreads": [],
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Flutter+Lexical+Codox'),
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
                        print("quill editor full state json: $fullState");
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
                            "root": {
                              "children": [
                                {
                                  "children": [],
                                  "direction": 'ltr',
                                  "format": '',
                                  "indent": 0,
                                  "type": 'paragraph',
                                  "version": 1,
                                  "textFormat": 0,
                                },
                              ],
                              "direction": 'ltr',
                              "format": '',
                              "indent": 0,
                              "type": 'root',
                              "version": 1,
                            },
                            "commentThreads": [],
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

                  _webViewController.addJavaScriptHandler(
                      handlerName: "onBlacklistedInsertHandler",
                      callback: (args) {
                        print(
                            "[onBlacklistedInsertHandler] blacklisted content detected");
                      });
                },
                onConsoleMessage: (controller, consoleMessage) {
                  /**
                   * Log all js logs into debug terminal
                   */
                  print('[LEXICAL_BUILD]: ${consoleMessage.message}');
                },
                onLoadStop: (controller, url) async {
                  /**
                   * When page is fully loaded:
                   *  - inject js/css scripts
                   *  - init lexcial editor with codox 
                   */
                  injectJsCss(controller);

                  // make a pause to ensure all js and css in injected
                  await Future.delayed(const Duration(
                      seconds: 2)); // Delay to ensure React components load

                  // init editor with codox with initial state
                  String initQuillStateJSON = jsonEncode(initLexicalStateRaw);
                  await _webViewController.evaluateJavascript(
                      source: "window.initLexicalEditor($initQuillStateJSON);");
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
          // await rootBundle.loadString('assets/quill.html');
          await rootBundle.loadString("assets/lexical/index.html");
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
      link.href = 'file:///android_asset/flutter_assets/assets/lexical/static/css/main.css'; // path to CSS
      document.head.appendChild(link);
    """);

    // Inject the JS file
    await controller.evaluateJavascript(source: """
      var script = document.createElement('script');
      script.src = 'file:///android_asset/flutter_assets/assets/lexical/static/js/main.js'; // path to JS
      document.body.appendChild(script);
    """);
  }
}
