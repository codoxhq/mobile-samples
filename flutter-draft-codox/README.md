## Flutter + Draft + Codox integration

Project contains sample code with basic Codox integration with Draft in Flutter application.<br/>
Draft editor with Codox integration is implemented within single ReactJS application, which should be build and loaded by Flutter app.

## Key points:

Draft+Codox integration is implemented with flutter InAppWebView plugin:

- Draft editor with Codox integration is implemented within ReactJS application.
- React+Draft+Codox starter app is available [here](https://github.com/codoxhq/mobile-samples/tree/master/starters/flutter-reactjs-draft-codox)
- Starter should be build locally and then loaded by InAppWebView plugin
- flutter-js 2 side communication is implemented to pass data from react app to flutter and vice versa
- Codox implementation includes subscribing flutter to codox hooks and error events - hooks invocations will trigger flutter callbacks and pass data

## How it works:

1. [React+Draft+Codox starter](https://github.com/codoxhq/mobile-samples/tree/master/starters/flutter-reactjs-draft-codox) should be cloned, configured (codox config) and build locally.
2. Flutter loads local reactjs build, which contains prepared javascript code with lexcial editor and codox init
3. flutter app invokes js function to setup initial editor state - in this demo, it is mocked. in real app must be fetched from backend. When init state is set up, codox sync session will launch.
4. flutter app adds listeners (callbacks) for codox hooks and error events. this is done via callbacks mechanism.
5. When codox hook is triggered in javascript, the flutter corresponding callback is invoked and data is passed to flutter.

## Installation:

1. Install Dart and Flutter on local machine. Follow [official guide](https://docs.flutter.dev/get-started/install)
2. Install Nodejs and npm on local machine. Follow [official quide](https://nodejs.org/en/download/package-manager). Ensure NodeJS is installed by:

   ```bash
      # should output version of nodeJS
      node --version
   ```

3. Clone [starter repository](https://github.com/codoxhq/mobile-samples/tree/master/starters/flutter-reactjs-draft-codox) and install dependencies:
   ```bash
      npm install
   ```
4. Set Codox config params: docId, username and apiKey:
   In starter repository go to **src/components/editor/EditorContainer.jsx**, find **codoxConfig** variable and change docId, username and apiKey:

   ```javascript
      // EditorContainer.jsx

      ...

      const codoxConfig = {
         docId: '[document id]', //this is the unique id used to distinguish different documents
         username: '[unique username]', //unique user name
         apiKey: '[codox apiKey]', // apiKey provided by codox
      // keep rest of config untouched
         ...
      };

      ...

   ```

5. Create starter project build:

   ```bash
      npm run build
   ```

   In root of the project, the **build/** directory will be generated. It will contain bundled source code.

6. Clone this repository
7. Copy the starter build into **assets/** \*/ dir. Rename build to **draft/**:

   ```bash
       cp -r [starter dir]/build/ flutter-draft-codox/assets/draft/
   ```

   > IMPORTANT: app code expects react app build in **assets/draft/**

8. Run debugging mode. Check [vscode guide](https://docs.flutter.dev/tools/vs-code)
   In vscode:
   - ctrl+shift+P -> flutter:SelectDevice -> choose emulator
   - in top menu -> Run -> Run Debugging

Check debug console, should output all logs, including js logs

## Configuration note:

To enable Codox sync, the local html, loaded by flutter, must have custom baseURL, which is equivalent to Codox "domain" in subscription.<br/>
In this demo, for demostration purposes, the demo subscription is used, with configured domain, which is setup here in code (see lib/main.dart file)<br/>
In real app, must configure own domain in codox subscription and put same baseURL in the app.
