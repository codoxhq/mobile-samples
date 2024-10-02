/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createTableNodeWithDimensions, INSERT_TABLE_COMMAND, TableNode } from '@lexical/table';
import { $insertNodes, COMMAND_PRIORITY_EDITOR, createCommand } from 'lexical';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as React from 'react';
import invariant from '../shared/invariant';

import Button from '../ui/Button';
import { DialogActions } from '../ui/Dialog';
import TextInput from '../ui/TextInput';

export const INSERT_NEW_TABLE_COMMAND = createCommand('INSERT_NEW_TABLE_COMMAND');

export const CellContext = createContext({
  cellEditorConfig: null,
  cellEditorPlugins: null,
  set: () => {
    // Empty
  },
});

export function TableContext({ children }) {
  const [contextValue, setContextValue] = useState({
    cellEditorConfig: null,
    cellEditorPlugins: null,
  });
  return (
    <CellContext.Provider
      value={useMemo(
        () => ({
          cellEditorConfig: contextValue.cellEditorConfig,
          cellEditorPlugins: contextValue.cellEditorPlugins,
          set: (cellEditorConfig, cellEditorPlugins) => {
            setContextValue({ cellEditorConfig, cellEditorPlugins });
          },
        }),
        [contextValue.cellEditorConfig, contextValue.cellEditorPlugins]
      )}
    >
      {children}
    </CellContext.Provider>
  );
}

export function InsertTableDialog({ activeEditor, onClose }) {
  const [rows, setRows] = useState('5');
  const [columns, setColumns] = useState('5');
  const [isDisabled, setIsDisabled] = useState(true);

  useEffect(() => {
    const row = Number(rows);
    const column = Number(columns);
    if (row && row > 0 && row <= 500 && column && column > 0 && column <= 50) {
      setIsDisabled(false);
    } else {
      setIsDisabled(true);
    }
  }, [rows, columns]);

  const onClick = () => {
    activeEditor.dispatchCommand(INSERT_TABLE_COMMAND, {
      columns,
      rows,
    });

    onClose();
  };

  return (
    <>
      <TextInput
        placeholder={'# of rows (1-500)'}
        label="Rows"
        onChange={setRows}
        value={rows}
        data-test-id="table-modal-rows"
        type="number"
      />
      <TextInput
        placeholder={'# of columns (1-50)'}
        label="Columns"
        onChange={setColumns}
        value={columns}
        data-test-id="table-modal-columns"
        type="number"
      />
      <DialogActions data-test-id="table-model-confirm-insert">
        <Button disabled={isDisabled} onClick={onClick}>
          Confirm
        </Button>
      </DialogActions>
    </>
  );
}

export function TablePlugin({ cellEditorConfig, children }) {
  const [editor] = useLexicalComposerContext();
  const cellContext = useContext(CellContext);

  useEffect(() => {
    if (!editor.hasNodes([TableNode])) {
      invariant(false, 'TablePlugin: TableNode is not registered on editor');
    }

    cellContext.set(cellEditorConfig, children);

    return editor.registerCommand(
      INSERT_NEW_TABLE_COMMAND,
      ({ columns, rows, includeHeaders }) => {
        const tableNode = $createTableNodeWithDimensions(Number(rows), Number(columns), includeHeaders);
        $insertNodes([tableNode]);
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [cellContext, cellEditorConfig, children, editor]);

  return null;
}
