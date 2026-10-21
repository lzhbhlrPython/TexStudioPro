import { useState } from 'react';
import { ChevronDown, Minus, Plus, Trash2 } from 'lucide-react';
import {
  appendToRow,
  makeNode,
  removeNode,
  updateNode,
  type AstNode,
} from '../lib/formulaAst';
import { useI18n } from '../i18n';

interface Props {
  root: AstNode;
  onChange: (root: AstNode) => void;
}

type NodeType = 'symbol' | 'frac' | 'sqrt' | 'script' | 'matrix' | 'cases' | 'text' | 'raw';

const addableTypes: NodeType[] = ['symbol', 'frac', 'sqrt', 'script', 'matrix', 'cases', 'text', 'raw'];

function AddControl({ onAdd }: { onAdd: (type: NodeType) => void }) {
  const { t } = useI18n();
  const [type, setType] = useState<NodeType>('symbol');
  return (
    <div className="ast-add">
      <select value={type} onChange={(event) => setType(event.target.value as NodeType)}>
        {addableTypes.map((item) => <option key={item} value={item}>{t(item)}</option>)}
      </select>
      <button onClick={() => onAdd(type)} title={t('Add node')}>
        <Plus size={11} />
      </button>
    </div>
  );
}

function NodeView({
  node,
  root,
  onChange,
  depth,
  slot,
  onRemove,
}: {
  node: AstNode;
  root: AstNode;
  onChange: (root: AstNode) => void;
  depth: number;
  slot?: string;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  const update = (patch: Partial<AstNode>) => {
    onChange(updateNode(root, node.id, (current) => ({ ...current, ...patch } as AstNode)));
  };

  if (node.type === 'row') {
    return (
      <div className={`ast-row ${depth === 0 ? 'root' : ''}`}>
        {slot && <span className="ast-slot-label">{slot}</span>}
        {node.children.map((child) => (
          <NodeView
            key={child.id}
            node={child}
            root={root}
            onChange={onChange}
            depth={depth + 1}
            onRemove={() => onChange(removeNode(root, child.id))}
          />
        ))}
        <AddControl
          onAdd={(type) => {
            const created = makeNode(type);
            onChange(appendToRow(root, node.id, created));
          }}
        />
      </div>
    );
  }

  if (node.type === 'symbol' || node.type === 'text' || node.type === 'raw') {
    const value = node.type === 'symbol' ? node.latex : node.type === 'text' ? node.value : node.latex;
    return (
      <div className={`ast-leaf ast-${node.type}`}>
        <span className="ast-leaf-tag">{t(node.type)}</span>
        {node.type === 'raw' ? (
          <textarea
            className="ast-raw-input"
            value={value}
            onChange={(event) => update({ latex: event.target.value } as Partial<AstNode>)}
            spellCheck={false}
          />
        ) : (
          <input
            className="ast-input"
            value={value}
            onChange={(event) =>
              update((node.type === 'symbol'
                ? { latex: event.target.value }
                : { value: event.target.value }) as Partial<AstNode>)
            }
            spellCheck={false}
          />
        )}
        {onRemove && <button className="ast-remove" onClick={onRemove} title={t('Delete')}><Minus size={10} /></button>}
      </div>
    );
  }

  const removeButton = onRemove ? (
    <button className="ast-remove" onClick={onRemove} title={t('Delete')}><Trash2 size={10} /></button>
  ) : null;

  if (node.type === 'frac') {
    return (
      <div className="ast-container">
        <div className="ast-container-head">
          <span><ChevronDown size={10} /> {t('Fraction')}</span>
          {removeButton}
        </div>
        <div className="ast-slots">
          <div className="ast-slot"><NodeView node={node.numerator} root={root} onChange={onChange} depth={depth + 1} slot={t('numerator')} /></div>
          <div className="ast-slot"><NodeView node={node.denominator} root={root} onChange={onChange} depth={depth + 1} slot={t('denominator')} /></div>
        </div>
      </div>
    );
  }

  if (node.type === 'sqrt') {
    return (
      <div className="ast-container">
        <div className="ast-container-head">
          <span><ChevronDown size={10} /> {t('Root')}</span>
          {removeButton}
        </div>
        <div className="ast-slots">
          <div className="ast-slot"><NodeView node={node.body} root={root} onChange={onChange} depth={depth + 1} slot={t('body')} /></div>
          <button
            className="ast-subadd"
            onClick={() => update({ index: node.index ? null : makeNode('symbol') } as Partial<AstNode>)}
          >
            {node.index ? t('remove index') : t('add index')}
          </button>
          {node.index && <div className="ast-slot"><NodeView node={node.index} root={root} onChange={onChange} depth={depth + 1} slot={t('index')} /></div>}
        </div>
      </div>
    );
  }

  if (node.type === 'script') {
    return (
      <div className="ast-container">
        <div className="ast-container-head">
          <span><ChevronDown size={10} /> {t('Script')}</span>
          {removeButton}
        </div>
        <div className="ast-slots">
          <div className="ast-slot"><NodeView node={node.base} root={root} onChange={onChange} depth={depth + 1} slot={t('base')} /></div>
          <div className="ast-slot">
            <NodeView node={node.sup || row()} root={root} onChange={onChange} depth={depth + 1} slot={t('superscript')} />
            <button
              className="ast-subadd"
              onClick={() => update({ sup: node.sup ? null : makeNode('symbol') } as Partial<AstNode>)}
            >
              {node.sup ? t('remove superscript') : t('add superscript')}
            </button>
          </div>
          <div className="ast-slot">
            <NodeView node={node.sub || row()} root={root} onChange={onChange} depth={depth + 1} slot={t('subscript')} />
            <button
              className="ast-subadd"
              onClick={() => update({ sub: node.sub ? null : makeNode('symbol') } as Partial<AstNode>)}
            >
              {node.sub ? t('remove subscript') : t('add subscript')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (node.type === 'matrix') {
    return (
      <div className="ast-container">
        <div className="ast-container-head">
          <span><ChevronDown size={10} /> {t('Matrix')}</span>
          <select
            className="ast-env-select"
            value={node.env}
            onChange={(event) => update({ env: event.target.value as 'pmatrix' })}
          >
            <option value="pmatrix">pmatrix</option>
            <option value="bmatrix">bmatrix</option>
            <option value="vmatrix">vmatrix</option>
          </select>
          {removeButton}
        </div>
        <div className="ast-matrix">
          {node.rows.map((cells, rowIndex) => (
            <div className="ast-matrix-row" key={`row-${rowIndex}`}>
              {cells.map((cell) => (
                <div className="ast-matrix-cell" key={cell.id}>
                  <NodeView node={cell} root={root} onChange={onChange} depth={depth + 1} />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="ast-container-actions">
          <button
            onClick={() => {
              const next = node.rows.map((cells) => [...cells, row()]);
              update({ rows: next } as Partial<AstNode>);
            }}
          >
            <Plus size={10} /> {t('add column')}
          </button>
          <button
            onClick={() => {
              const next = [...node.rows, node.rows[0].map(() => row())];
              update({ rows: next } as Partial<AstNode>);
            }}
          >
            <Plus size={10} /> {t('add row')}
          </button>
        </div>
      </div>
    );
  }

  if (node.type === 'cases') {
    return (
      <div className="ast-container">
        <div className="ast-container-head">
          <span><ChevronDown size={10} /> {t('Cases')}</span>
          {removeButton}
        </div>
        <div className="ast-cases">
          {node.rows.map((entry, index) => (
            <div className="ast-case-row" key={`case-${index}`}>
              <NodeView node={entry.expression} root={root} onChange={onChange} depth={depth + 1} slot={t('expression')} />
              <NodeView node={entry.condition} root={root} onChange={onChange} depth={depth + 1} slot={t('condition')} />
            </div>
          ))}
        </div>
        <div className="ast-container-actions">
          <button
            onClick={() => update({ rows: [...node.rows, { expression: row(), condition: row() }] } as Partial<AstNode>)}
          >
            <Plus size={10} /> {t('add case')}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

function row(): AstNode {
  return makeNode('row');
}

export function FormulaTree({ root, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="formula-tree">
      <div className="formula-tree-hint">{t('Build the formula as a tree; the generated LaTeX updates live.')}</div>
      <NodeView node={root} root={root} onChange={onChange} depth={0} />
    </div>
  );
}
