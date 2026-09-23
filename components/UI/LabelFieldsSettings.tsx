import React, { useState } from 'react';
import { useLabelFieldsStore } from '../../lib/labelFieldsStore';
import type { LabelField } from '../../lib/supabase';

const LabelFieldsSettings: React.FC<{
  fields: LabelField[];
  onClose: () => void;
}> = ({ fields, onClose }) => {
  const addField = useLabelFieldsStore((s) => s.addField);
  const renameField = useLabelFieldsStore((s) => s.renameField);
  const updateFieldValues = useLabelFieldsStore((s) => s.updateFieldValues);
  const _reorderFields = useLabelFieldsStore((s) => s.reorderFields);
  const removeField = useLabelFieldsStore((s) => s.removeField);

  const [newName, setNewName] = useState('');
  const [editingValuesId, setEditingValuesId] = useState<string | null>(null);
  const [valuesDraft, setValuesDraft] = useState('');

  const startEditValues = (field: LabelField) => {
    setEditingValuesId(field.id);
    setValuesDraft(field.values.join('\n'));
  };

  const saveValues = async (id: string) => {
    const vals = valuesDraft.split('\n').map((v) => v.trim()).filter(Boolean);
    await updateFieldValues(id, vals);
    setEditingValuesId(null);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addField(newName.trim());
    setNewName('');
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[520px] max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 text-sm">Label Fields</h2>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <p className="text-xs text-gray-500 leading-relaxed">
            Define how reviews are organised. Each field becomes a grouping dimension in the tracker. Deleting a field hides it from grouping but leaves stored values untouched.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {fields.length === 0 && (
            <p className="text-xs text-gray-400 italic text-center py-4">No label fields yet. Add one below.</p>
          )}
          {fields.map((field, idx) => (
            <div key={field.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-400 w-4">{idx + 1}</span>
                <input
                  value={field.name}
                  onChange={(e) => renameField(field.id, e.target.value)}
                  className="flex-1 text-sm font-semibold text-gray-900 border border-transparent hover:border-gray-200 focus:border-black rounded px-2 py-1 focus:outline-none"
                />
                <button
                  onClick={() => startEditValues(field)}
                  className="text-[10px] font-mono text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                >
                  {field.values.length > 0 ? `${field.values.length} values` : 'Free text'}
                </button>
                <button
                  onClick={() => removeField(field.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors text-sm px-1"
                  title="Delete field (stored values are preserved)"
                >✕</button>
              </div>
              {editingValuesId === field.id && (
                <div className="space-y-2 pl-6">
                  <p className="text-[10px] text-gray-400 font-mono">One value per line. Empty = free text.</p>
                  <textarea
                    value={valuesDraft}
                    onChange={(e) => setValuesDraft(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-black resize-none"
                    placeholder="Value 1&#10;Value 2&#10;Value 3"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveValues(field.id)}
                      className="px-3 py-1 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800 transition-colors">Save</button>
                    <button onClick={() => setEditingValuesId(null)}
                      className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="New field name…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            <button onClick={handleAdd} disabled={!newName.trim()}
              className="px-4 py-2 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Add field
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default LabelFieldsSettings;
