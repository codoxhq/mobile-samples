/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';

import { SharedHistoryContext } from './context/SharedHistoryContext';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import { TableContext } from './plugins/TablePlugin';
import PlaygroundEditorTheme from './themes/PlaygroundEditorTheme';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { ClearEditorPlugin } from '@lexical/react/LexicalClearEditorPlugin';
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HashtagPlugin } from '@lexical/react/LexicalHashtagPlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { CAN_USE_DOM } from './shared/canUseDOM';

import { useSharedHistoryContext } from './context/SharedHistoryContext';
import ActionsPlugin from './plugins/ActionsPlugin';
import AutoEmbedPlugin from './plugins/AutoEmbedPlugin';
import AutoLinkPlugin from './plugins/AutoLinkPlugin';
import CodeActionMenuPlugin from './plugins/CodeActionMenuPlugin';
import CodeHighlightPlugin from './plugins/CodeHighlightPlugin';
import CollapsiblePlugin from './plugins/CollapsiblePlugin';
import ComponentPickerPlugin from './plugins/ComponentPickerPlugin';
import DragDropPaste from './plugins/DragDropPastePlugin';
import DraggableBlockPlugin from './plugins/DraggableBlockPlugin';
import EmojiPickerPlugin from './plugins/EmojiPickerPlugin';
import EmojisPlugin from './plugins/EmojisPlugin';
import EquationsPlugin from './plugins/EquationsPlugin';
import ExcalidrawPlugin from './plugins/ExcalidrawPlugin';
import FigmaPlugin from './plugins/FigmaPlugin';
import FloatingLinkEditorPlugin from './plugins/FloatingLinkEditorPlugin';
import FloatingTextFormatToolbarPlugin from './plugins/FloatingTextFormatToolbarPlugin';
import ImagesPlugin from './plugins/ImagesPlugin';
import InlineImagePlugin from './plugins/InlineImagePlugin';
import KeywordsPlugin from './plugins/KeywordsPlugin';
import { LayoutPlugin } from './plugins/LayoutPlugin/LayoutPlugin';
import LinkPlugin from './plugins/LinkPlugin';
import ListMaxIndentLevelPlugin from './plugins/ListMaxIndentLevelPlugin';
import MarkdownShortcutPlugin from './plugins/MarkdownShortcutPlugin';
import MentionsPlugin from './plugins/MentionsPlugin';
import PageBreakPlugin from './plugins/PageBreakPlugin';
import PollPlugin from './plugins/PollPlugin';
import TabFocusPlugin from './plugins/TabFocusPlugin';
import TableCellActionMenuPlugin from './plugins/TableActionMenuPlugin';
import TableCellResizer from './plugins/TableCellResizer';
import ToolbarPlugin from './plugins/ToolbarPlugin';
import TreeViewPlugin from './plugins/TreeViewPlugin';
import TwitterPlugin from './plugins/TwitterPlugin';
import YouTubePlugin from './plugins/YouTubePlugin';
import ContentEditable from './ui/ContentEditable';
import Placeholder from './ui/Placeholder';

import { CodoxCollabPlugin, registerNodesWithCodox, CodoxCommentPlugin, validateStateStructure } from '../codoxCollab';

/**
 * Wrap registered nodes classes by codox, before passing into editor
 */
const LEXICAL_NODES_TO_REGISTER = registerNodesWithCodox([...PlaygroundNodes]);

/**
 * Main App Component
 * For demonstation contains Lexical Provider and all plugins here.
 * External plugins are borrowed from offical lexical playground
 */
export default function App() {
  const { historyState } = useSharedHistoryContext();
  const [floatingAnchorElem, setFloatingAnchorElem] = useState(null);
  const [isLinkEditMode, setIsLinkEditMode] = useState(false);

  const onRef = (_floatingAnchorElem) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };
  // flag for codox start
  const [codoxStarted, setCodoxStarted] = useState(false);
  // initial lexcial editor state - jsoned prepresentation, defaults to null
  const [initLexicalState, setInitLexicalState] = useState(null);
  // ref for codoxAPI
  const codoxAPI = useRef();

  /**
   * Global scope functions attached to window, available for swift code to invoke.
   * Attach to window when component is mounted into DOM
   */
  useEffect(() => {
    /**
     * This method can be extended to pass other params for codox, like docId, username, apiKey
     */
    window.initLexicalEditor = function (initState) {
      try {
        /**
         * Invoke codox provided helper to validate state before launching editor
         */
        validateStateStructure(initState, LEXICAL_NODES_TO_REGISTER); // if invalid - will throw

        setInitLexicalState(initState);
      } catch (err) {
        console.error('[setInitLexicalState] error: ', err);
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
     * Invoke swift to get fetched content
     * Expected reponse semantics: {content: [lex jsoned state], timestamp: [Number]}
     */
    try {
      console.log('[CODOX][fetchDocOnNetworkReconnect] hook invoked');
      return await new Promise((resolve, reject) => {
        /**
         * Set up a temp response handler for response from swift
         * This callback will be invoked by swift with fetched state
         * Wiat here until callback is invoked
         *
         * Reason to have this: postMessage() interface does not wiat for response.
         *  on swift side, when it is ready to return data, the temp callback will be invoked.
         *  Here, all this si wrapped in promise to keep it within single async call
         * */
        window.fetchDocOnReconnectHookResponse = (data) => {
          const { content, timestamp } = JSON.parse(data);
          resolve({ content, timestamp });
          delete window.fetchDocOnReconnectHookResponse;
        };

        // trigger swift to fetch state
        window.webkit.messageHandlers.fetchDocOnNetworkReconnect.postMessage();
      });
    } catch (err) {
      console.error('[CODOX][fetchDocOnNetworkReconnect] swift call error: ', err);
    }
  };

  // will be invoked by Codox hook
  const contentChanged = (content) => {
    /**
     * Invoke swift and send data when content is changed
     */
    try {
      const json = JSON.stringify(content);
      window.webkit.messageHandlers.contentChanged.postMessage(json);
    } catch (err) {
      console.error('[CODOX][contentChanged] swift call error: ', err);
    }
  };

  // will be invoked by Codox hook
  const usersUpdate = (users) => {
    /**
     * Invoke swift and send data, when remote users change
     */
    try {
      const json = JSON.stringify(users);
      window.webkit.messageHandlers.usersUpdate.postMessage(json);
    } catch (err) {
      console.error('[CODOX][usersUpdate] swift call error: ', err);
    }
  };

  // will be invoked by Codox callback
  let onBlacklistedInsert = () => {
    /**
     * Invoke swift to notify user and do any custom actions, e.g. show modal/tooltip
     */
    try {
      window.webkit.messageHandlers.usersUpdate.onBlacklistedInsert.postMessage();
    } catch (err) {
      console.error('[CODOX][onBlacklistedInsert] swift call error: ', err);
    }
  };

  // will be invoked by Codox - error events listener
  const onCodoxError = function (data) {
    try {
      const json = JSON.stringify(data);
      window.webkit.messageHandlers.onCodoxError.postMessage(json);
    } catch (err) {
      console.error('[CODOX][onCodoxError] swift call error: ', err);
    }
  };

  // start codox
  const startCodoxSession = () => {
    // ensure codoxAPI exists
    if (!codoxAPI.current) return;

    // stop already running session, if it exists
    if (codoxStarted) stopCodoxSession();

    // create codox config object
    const codoxConfig = {
      docId: '[unique document id]', //this is the unique id used to distinguish different documents
      username: '[unique username]', //unique user name
      apiKey: '[your codox apiKey]', // apiKey provided by codox
      hooks: {
        fetchDocOnNetworkReconnect,
        contentChanged,
        usersUpdate,
      },
    };

    // init comments via codox api - will do nothing if commentThreads are missing
    codoxAPI.current.initComments(initLexicalState.commentThreads);

    /**
     * subscribe to codox events:
     *  for demostration here subscribe to error events.
     *  Check https://docs.codox.io for all available events
     */
    codoxAPI.current.on('error', onCodoxError);

    // start codox session
    codoxAPI.current
      .start(codoxConfig)
      .then(() => {
        console.log('[CODOX][codox.start] success');
        setCodoxStarted(true);
      })
      .catch((err) => console.log('[CODOX][codox.start] error', err));
  };

  // stop codox
  const stopCodoxSession = () => {
    if (codoxAPI.current) {
      codoxAPI.current.stop();
    }
    setCodoxStarted(false);
  };

  useEffect(() => {
    if (initLexicalState && !codoxStarted) {
      /**
       * Codox starts session when initial state and docId are in place
       */
      startCodoxSession();
    }
  }, [initLexicalState, codoxStarted]);

  /**
   * Initial config for Lexical Composer - init only when init state exists
   */
  const initLexicalConfig = useMemo(() => {
    if (!initLexicalState) return;
    return {
      editorState: JSON.stringify({ root: initLexicalState.root }), // use null as init state, when init state is fetched, it will be applied by codox
      namespace: `Playground`, // can use own namespace name, "Playground" is for example here
      nodes: LEXICAL_NODES_TO_REGISTER, // should wrap nodes into codox register fn
      onError: (error) => {
        /**
         * client's error handler
         * When lexical throws, errors will be catched and exposed here
         *
         * Can call swift here to notify swift code
         */
        console.error('[Lexical Demo][Editor Error Captured]: ', error);
      },
      theme: PlaygroundEditorTheme, // css theme, as example, official playground theme is used
    };
  }, [initLexicalState]);

  const shouldRenderEditor = !!initLexicalState;
  return (
    <>
      {shouldRenderEditor && (
        <LexicalComposer initialConfig={initLexicalConfig}>
          <SharedHistoryContext>
            <TableContext>
              <div className="editor-shell">
                <>
                  <ToolbarPlugin setIsLinkEditMode={setIsLinkEditMode} />

                  <div className={`editor-container tree-view`}>
                    <DragDropPaste />
                    <AutoFocusPlugin />
                    <ClearEditorPlugin />
                    <ComponentPickerPlugin />
                    <EmojiPickerPlugin />
                    <AutoEmbedPlugin />

                    <MentionsPlugin />
                    <EmojisPlugin />
                    <HashtagPlugin />
                    <KeywordsPlugin />
                    <AutoLinkPlugin />

                    <HistoryPlugin externalHistoryState={historyState} />

                    <RichTextPlugin
                      contentEditable={
                        <div className="editor-scroller">
                          <div className="editor" ref={onRef}>
                            <ContentEditable />
                          </div>
                        </div>
                      }
                      placeholder={<Placeholder>{'Enter some plain text...'}</Placeholder>}
                      ErrorBoundary={LexicalErrorBoundary}
                    />
                    <MarkdownShortcutPlugin />
                    <CodeHighlightPlugin />
                    <ListPlugin />
                    <CheckListPlugin />
                    <ListMaxIndentLevelPlugin maxDepth={7} />
                    <TablePlugin hasCellMerge={true} hasCellBackgroundColor={true} />
                    <TableCellResizer />
                    <ImagesPlugin />
                    <InlineImagePlugin />
                    <LinkPlugin />
                    <PollPlugin />
                    <TwitterPlugin />
                    <YouTubePlugin />
                    <FigmaPlugin />
                    <ClickableLinkPlugin />
                    <HorizontalRulePlugin />
                    <EquationsPlugin />
                    <ExcalidrawPlugin />
                    <TabFocusPlugin />
                    <TabIndentationPlugin />
                    <CollapsiblePlugin />
                    <PageBreakPlugin />
                    <LayoutPlugin />
                    {floatingAnchorElem && (
                      <>
                        <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
                        <CodeActionMenuPlugin anchorElem={floatingAnchorElem} />
                        <FloatingLinkEditorPlugin
                          anchorElem={floatingAnchorElem}
                          isLinkEditMode={isLinkEditMode}
                          setIsLinkEditMode={setIsLinkEditMode}
                        />
                        <TableCellActionMenuPlugin anchorElem={floatingAnchorElem} cellMerge={true} />
                        <FloatingTextFormatToolbarPlugin anchorElem={floatingAnchorElem} />
                      </>
                    )}

                    <ActionsPlugin isRichText={true} />
                  </div>
                  {/* Disabled - lex plugin to display current editor state and actions */}
                  {/* <TreeViewPlugin /> */}
                </>

                <CodoxCollabPlugin
                  ref={codoxAPI}
                  // callback to trigger when attempt to insert/paste blacklisted content combination
                  onBlacklistedInsert={onBlacklistedInsert}
                />
                {/* Optional comments, provided by Codox */}
                <CodoxCommentPlugin />
              </div>
            </TableContext>
          </SharedHistoryContext>
        </LexicalComposer>
      )}
    </>
  );
}
