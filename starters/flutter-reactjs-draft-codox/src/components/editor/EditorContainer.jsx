import React, { useRef, useEffect, useState, memo } from "react";

// draftjs components
import {
  //   Editor, // use native editor without plugins integrations
  EditorState,
  getDefaultKeyBinding,
  RichUtils,
  convertFromRaw,
  // convertToRaw,
  // ContentState,
} from "draft-js";
import Editor from "@draft-js-plugins/editor"; // use wrapped editor with plugins integrations
import createLinkifyPlugin from "@draft-js-plugins/linkify";

import { EditorWrapper, PanelButton } from "./EditorStyles";
import InlineStyleControls from "./InlineStyleControls";
import BlockStyleControls from "./BlockStyleControls";

import { withCodox } from "../../codoxCollab";

/**
 * Plugins from @draft-js-plugins
 * Create outside the scope of component.
 * For demonstration link plugin is implemented here.
 * Follow same pattern to add other plugins
 */
const linkifyPlugin = createLinkifyPlugin({ target: "_blank" });

// plugins map
const plugins = {
  linkifyPlugin,
};
const pluginsList = Object.values(plugins); //array representation

// decorate editor outside component to avoid re-creations during re-renders or, if place it into comp body, use useMemo to wrap only once
const EditorWithCodox = withCodox(Editor);

// editor container
const EditorContainer = () => {
  // ref for codox api to call codox methods - should be passed as prop into EditorWithCodox
  const codoxAPI = useRef();

  // flag for codox start
  const [codoxStarted, setCodoxStarted] = useState(false);

  /**
   * Draft editor state, will store latest synced draft state representation
   * setEditorState should be passed as prop to EditorWithCodox, Codox will handle updates
   * Default with empty draft state
   */
  const [localEditorState, setLocalEditorState] = useState(EditorState.createEmpty());

  /**
   * Global scope functions attached to window, available for flutter code to invoke.
   * Attach to window when component is mounted into DOM
   */
  useEffect(() => {
    /**
     * This method can be extended to pass other params for codox, like docId, username, apiKey
     */
    window.initDraftEditor = function (initState) {
      try {
        /**
         * Convert json state to draft repesentation and save to local state
         */
        const draftContentState = convertFromRaw(initState);
        const draftState = EditorState.createWithContent(draftContentState);
        // save to local state
        setLocalEditorState(draftState);
        // launch codox session
        startCodoxSession();
      } catch (err) {
        console.error("[initDraftEditor] error: ", err);
      }
    };

    /**
     * Extra api for enable/disable rendering of remote users cursors
     */
    window.showRemoteCursors = function () {
      codoxAPI && codoxAPI.current.cursor.show();
    };
    window.hideRemoteCursors = function () {
      codoxAPI && codoxAPI.current.cursor.hide();
    };
  }, []);

  // will be invoked by Codox hook
  const fetchDocOnNetworkReconnect = async () => {
    /**
     * Invoke flutter to get fetched content
     * Expected reponse semantics: {content: [lex jsoned state], timestamp: [Number]}
     */
    try {
      const data = await window.flutter_inappwebview.callHandler(
        "fetchDocOnNetworkReconnectHookHandler"
      );
      return data;
    } catch (err) {
      console.error("[CODOX][fetchDocOnNetworkReconnect] flutter call error: ", err);
    }
  };

  // will be invoked by Codox hook
  const contentChanged = (content) => {
    /**
     * Invoke flutter and send data when content is changed
     */
    try {
      const json = JSON.stringify(content);
      window.flutter_inappwebview.callHandler("contentChangedHookHandler", json);
    } catch (err) {
      console.error("[CODOX][contentChanged] flutter call error: ", err);
    }
  };

  // will be invoked by Codox hook
  const usersUpdate = (users) => {
    /**
     * Invoke flutter and send data, when remote users change
     */
    try {
      const json = JSON.stringify(users);
      window.flutter_inappwebview.callHandler("usersUpdateHookHandler", json);
    } catch (err) {
      console.error("[CODOX][usersUpdate] flutter call error: ", err);
    }
  };

  // will be invoked by Codox - error events listener
  const onCodoxError = function (data) {
    try {
      const json = JSON.stringify(data);
      window.flutter_inappwebview.callHandler("codoxErrorEventListener", json);
    } catch (err) {
      console.error("[CODOX][onCodoxError] flutter call error: ", err);
    }
  };

  // will be invoked by Codox to set local state here after sync
  const setState = (state) => {
    // NOTE: returned state preserve undo/redo stacks
    setLocalEditorState(state);
  };

  // start codox
  const startCodoxSession = () => {
    // ensure codoxAPI exists
    if (!codoxAPI.current) return;
    // stop already running session, if it exists
    if (codoxStarted) stopCodoxSession();
    // // create codox config object
    const codoxConfig = {
      docId: "[unique document id]", //this is the unique id used to distinguish different documents
      username: "[unique username]", //unique user name
      apiKey: "[your codox apiKey here]", // apiKey provided by codox,
      autostart: true,
      hooks: {
        fetchDocOnNetworkReconnect,
        contentChanged,
        usersUpdate,
      },
    };
    /**
     * subscribe to codox events:
     *  for demostration here subscribe to error events.
     *  Check https://docs.codox.io for all available events
     */
    codoxAPI.current.on("error", onCodoxError);
    // start codox session
    codoxAPI.current
      .start(codoxConfig)
      .then(() => {
        console.log("[CODOX][codox.start] success");
        setCodoxStarted(true);
      })
      .catch((err) => console.log("[CODOX][codox.start] error", err));
  };

  // stop codox
  const stopCodoxSession = () => {
    if (codoxAPI.current) {
      codoxAPI.current.stop();
    }
    setCodoxStarted(false);
  };

  // on editor change
  const onEditorChange = (newEditorState) => {
    // only when either content or selection changed
    if (
      !newEditorState.getCurrentContent().equals(localEditorState.getCurrentContent()) ||
      !localEditorState.getSelection().equals(newEditorState.getSelection())
    ) {
      // do any app specific update to editor state, e.g. invoke flutter code

      //delegate to codox provider - MUST NOT update local state explicitly here - codox will do that
      // method can be called when ref is not exising yet, before codox started  - that's why check ref first

      codoxAPI && codoxAPI.current && codoxAPI.current.onEditorChange(newEditorState);
    }
  };

  const handleKeyCommand = (command, editorState) => {
    // rich utils process
    const newState = RichUtils.handleKeyCommand(editorState, command);
    if (newState) {
      onEditorChange(newState);
      return true;
    }
    return false;
  };

  const mapKeyToEditorCommand = (e) => {
    if (e.keyCode === 9) {
      // TAB
      const newEditorState = RichUtils.onTab(e, localEditorState, 4); // 4 is for maxDepth

      if (newEditorState !== localEditorState) {
        onEditorChange(newEditorState);
      }
      return;
    }
    return getDefaultKeyBinding(e);
  };

  const toggleBlockType = (blockType) => {
    onEditorChange(RichUtils.toggleBlockType(localEditorState, blockType));
  };

  const toggleInlineStyle = (inlineStyle) => {
    onEditorChange(RichUtils.toggleInlineStyle(localEditorState, inlineStyle));
  };

  //   styling related functions
  const pickupEditorInnerWrapperStyles = () => {
    // If the user changes block type before entering any text, we can
    // either style the placeholder or hide it. Let's just hide it now.
    let className = "RichEditor-editor";
    const contentState = localEditorState && localEditorState.getCurrentContent();
    if (contentState && !contentState.hasText()) {
      if (contentState.getBlockMap().first().getType() !== "unstyled") {
        className += " RichEditor-hidePlaceholder";
      }
    }
    return className;
  };

  // Custom overrides for "code" style.
  const styleMap = {
    CODE: {
      backgroundColor: "rgba(0, 0, 0, 0.05)",
      fontFamily: '"Inconsolata", "Menlo", "Consolas", monospace',
      fontSize: 16,
      padding: 2,
    },
  };

  function getBlockStyle(block) {
    return block.getType() === "blockquote" ? "RichEditor-blockquote" : null;
  }

  const onUndo = () => {
    // delegate undo to codox
    codoxAPI && codoxAPI.current && codoxAPI.current.onUndo(localEditorState);
  };
  const onRedo = () => {
    // delegate redo to codox
    codoxAPI && codoxAPI.current && codoxAPI.current.onRedo(localEditorState);
  };

  let isUndoStackEmpty = localEditorState && localEditorState.getUndoStack().size === 0;
  let isRedoStackIsEmpty = localEditorState && localEditorState.getRedoStack().size === 0;

  return (
    <>
      <EditorWrapper>
        <BlockStyleControls editorState={localEditorState} onToggle={toggleBlockType} />
        <InlineStyleControls editorState={localEditorState} onToggle={toggleInlineStyle} />

        <div>
          <PanelButton
            onClick={onUndo}
            isDisabled={isUndoStackEmpty} // when undo stack is empty
          >
            Undo
          </PanelButton>
          <PanelButton
            onClick={onRedo}
            isDisabled={isRedoStackIsEmpty} // when redo stack is empty
          >
            Redo
          </PanelButton>
        </div>

        <div className={pickupEditorInnerWrapperStyles()}>
          <EditorWithCodox
            // required props for codox
            ref={codoxAPI}
            editorState={localEditorState}
            setEditorState={setState}
            // draft editor native props
            blockStyleFn={getBlockStyle}
            customStyleMap={styleMap}
            handleKeyCommand={handleKeyCommand}
            keyBindingFn={mapKeyToEditorCommand}
            onChange={onEditorChange}
            placeholder="Type your text here..."
            preserveSelectionOnBlur={true}
            plugins={pluginsList} // optional, in case of plugins usage
            // spellCheck
          />
        </div>
      </EditorWrapper>
    </>
  );
};

export default memo(EditorContainer);
