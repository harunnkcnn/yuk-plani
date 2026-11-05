import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dict, Lang } from '../i18n';
import { parseTable, tableHeaders, toCsv, type LengthUnit } from '../lib/table';
import { itemFromTemplate } from '../lib/presets';
import type { CargoItem } from '../lib/types';
import { download } from '../download';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (items: CargoItem[], mode: 'append' | 'replace') => void;
  colorOffset: number;
  t: Dict;
  lang: Lang;
}

export function ImportDialog({ open, onClose, onImport, colorOffset, t, lang }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [unit, setUnit] = useState<LengthUnit>('mm');

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const parsed = useMemo(() => parseTable(text, unit, colorOffset), [text, unit, colorOffset]);

  const finish = (mode: 'append' | 'replace') => {
    onImport(parsed.items, mode);
    setText('');
    onClose();
  };

  const template = () => {
    const sample = [
      { ...itemFromTemplate('euro', lang === 'tr' ? 'Akü paleti' : 'Battery pallet', 0), quantity: 8, weight: 720, stop: 2 },
      { ...itemFromTemplate('box', lang === 'tr' ? 'Filtre kolisi' : 'Filter carton', 1), quantity: 40, stop: 1 },
    ];
    download(toCsv(sample, lang), lang === 'tr' ? 'yuk-listesi-sablon.csv' : 'cargo-list-template.csv', 'text/csv;charset=utf-8');
  };

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby="import-h">
      <form method="dialog" className="dialog-body" onSubmit={(e) => e.preventDefault()}>
        <h2 id="import-h">{t.import.title}</h2>
        <p className="hint">{t.import.help}</p>
        <p className="columns">{tableHeaders(lang).join(' · ')}</p>
        <label className="field">
          <span className="visually-hidden">{t.import.title}</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} spellCheck={false} placeholder={tableHeaders(lang).join('\t')} />
        </label>
        <div className="dialog-row">
          <label className="field inline">
            <span className="field-label">{t.import.unit}</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)}>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </label>
          <label className="file-btn">
            {t.import.file}
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setText(await file.text());
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" className="btn btn-quiet" onClick={template}>
            {t.import.template}
          </button>
        </div>
        <p className="hint" role="status">
          {text.trim() ? t.import.preview(parsed.items.length) : ''}
          {parsed.skipped.length > 0 && ` · ${t.import.skipped(parsed.skipped.join(', '))}`}
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            {t.import.cancel}
          </button>
          <button type="button" className="btn" disabled={parsed.items.length === 0} onClick={() => finish('replace')}>
            {t.import.replace}
          </button>
          <button type="button" className="btn btn-primary" disabled={parsed.items.length === 0} onClick={() => finish('append')}>
            {t.import.append}
          </button>
        </div>
      </form>
    </dialog>
  );
}
