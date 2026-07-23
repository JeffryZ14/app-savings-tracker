"use client";

import { useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { exportBackup, importBackup } from "@/features/backup/actions";
import "./BackupControls.css";

interface BackupControlsProps {
  onImported: () => void | Promise<void>;
  onError: (msg: string) => void;
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Escapa un campo para CSV (comillas dobles y separadores).
function csvField(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function BackupControls({ onImported, onError }: BackupControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleExportJson() {
    const res = await exportBackup();
    if (!res.success) return onError(res.error ?? "Error al exportar");
    triggerDownload(
      `respaldo-ahorros-${today()}.json`,
      JSON.stringify(res.data, null, 2),
      "application/json"
    );
  }

  async function handleExportCsv() {
    const res = await exportBackup();
    if (!res.success) return onError(res.error ?? "Error al exportar");
    const rows: string[] = ["meta,icono,movimiento_fecha,tipo,monto,descripcion"];
    for (const g of res.data.goals) {
      if (g.movements.length === 0) {
        rows.push([g.title, g.icon, "", "", "", ""].map(csvField).join(","));
        continue;
      }
      for (const m of g.movements) {
        rows.push(
          [g.title, g.icon, m.createdAt, m.type, m.amount, m.description].map(csvField).join(",")
        );
      }
    }
    triggerDownload(`movimientos-ahorros-${today()}.csv`, rows.join("\n"), "text/csv;charset=utf-8");
  }

  function handlePickFile() {
    fileRef.current?.click();
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setPending(data);
    } catch {
      onError("No se pudo leer el archivo: no es un JSON válido");
    }
  }

  async function handleConfirmImport() {
    if (!pending) return;
    setBusy(true);
    const res = await importBackup(pending);
    setBusy(false);
    setPending(null);
    if (!res.success) return onError(res.error ?? "Error al importar");
    await onImported();
  }

  return (
    <section className="bk-card" aria-label="Datos y respaldo">
      <div className="bk-head">
        <h2 className="bk-title">Datos y respaldo</h2>
        <p className="bk-sub">Descarga una copia de tus metas o restáurala en otro dispositivo.</p>
      </div>

      <div className="bk-actions">
        <button className="bk-btn" onClick={handleExportJson}>
          <Download size={15} /> Descargar respaldo (JSON)
        </button>
        <button className="bk-btn" onClick={handleExportCsv}>
          <FileSpreadsheet size={15} /> Exportar movimientos (CSV)
        </button>
        <button className="bk-btn bk-btn-outline" onClick={handlePickFile}>
          <Upload size={15} /> Importar respaldo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChosen}
          hidden
          aria-hidden="true"
        />
      </div>

      {pending && (
        <div className="bk-confirm" role="alertdialog" aria-label="Confirmar importación">
          <div className="bk-confirm-icon"><AlertTriangle size={18} /></div>
          <div className="bk-confirm-body">
            <p className="bk-confirm-text">
              Importar <strong>reemplazará todos tus datos actuales</strong> (metas, movimientos y
              deudas) por los del archivo. Esta acción no se puede deshacer.
            </p>
            <div className="bk-confirm-actions">
              <button className="bk-btn bk-btn-danger" onClick={handleConfirmImport} disabled={busy}>
                {busy ? "Importando…" : "Sí, reemplazar mis datos"}
              </button>
              <button className="bk-btn bk-btn-outline" onClick={() => setPending(null)} disabled={busy}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
