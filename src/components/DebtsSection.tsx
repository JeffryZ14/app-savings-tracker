"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Check, ChevronDown, ChevronUp, HandCoins, Trash2, Pencil } from "lucide-react";
import { createDebt, addDebtPayment, updateDebt } from "@/features/debts/actions";
import type { DeleteTarget } from "@/components/DeleteConfirmModal";

interface DebtPaymentData {
  id: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

export interface DebtData {
  id: string;
  person: string;
  concept: string | null;
  amount: number;
  outstanding: number;
  isSettled: boolean;
  createdAt: string;
  payments: DebtPaymentData[];
}

interface DebtsSectionProps {
  debts: DebtData[];
  totalReceivable: number;
  formatSoles: (n: number) => string;
  onChanged: () => Promise<void> | void;
  onError: (msg: string) => void;
  onRequestDelete: (target: DeleteTarget) => void;
}

export default function DebtsSection(props: DebtsSectionProps) {
  const { debts, totalReceivable, formatSoles } = props;
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerson, setEditPerson] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editAmount, setEditAmount] = useState("");

  async function handleCreate() {
    const p = person.trim();
    const amt = parseFloat(amount);
    if (!p || !amt || amt <= 0) return;
    const res = await createDebt({ person: p, concept: concept.trim() || undefined, amount: amt });
    if (res.success) {
      setPerson("");
      setConcept("");
      setAmount("");
      setAdding(false);
      await props.onChanged();
    } else {
      props.onError(res.error ?? "Error al crear la deuda");
    }
  }

  function startEdit(d: DebtData) {
    setEditingId(d.id);
    setPayingId(null);
    setEditPerson(d.person);
    setEditConcept(d.concept ?? "");
    setEditAmount(String(d.amount));
  }

  async function handleUpdate(debtId: string) {
    const p = editPerson.trim();
    const amt = parseFloat(editAmount);
    if (!p || !amt || amt <= 0) return;
    const res = await updateDebt(debtId, {
      person: p,
      concept: editConcept.trim() || undefined,
      amount: amt,
    });
    if (res.success) {
      setEditingId(null);
      await props.onChanged();
    } else {
      props.onError(res.error ?? "Error al actualizar la deuda");
    }
  }

  async function handlePay(debtId: string) {
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) return;
    const res = await addDebtPayment(debtId, { amount: amt });
    if (res.success) {
      setPayingId(null);
      setPayAmount("");
      await props.onChanged();
    } else {
      props.onError(res.error ?? "Error al registrar el pago");
    }
  }

  return (
    <section className="dbt-root">
      <style>{`
        .dbt-root { margin-top: clamp(30px, 6vw, 44px); }
        .dbt-head {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 14px 16px; background: var(--surface-2); border: 1px solid var(--border);
          border-radius: var(--radius); cursor: pointer;
        }
        .dbt-head:hover { border-color: var(--muted); }
        .dbt-head-left { display: flex; align-items: center; gap: 11px; min-width: 0; }
        .dbt-head-icon {
          width: 36px; height: 36px; border-radius: 10px; background: var(--brand-soft);
          color: var(--brand); display: grid; place-items: center; flex-shrink: 0;
        }
        .dbt-head-title { font-family: var(--font-display); font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
        .dbt-head-sub { font-family: var(--font-mono); font-size: 12px; color: var(--muted); margin-top: 1px; }
        .dbt-head-sub b { color: var(--text); font-weight: 600; }
        .dbt-chev { color: var(--muted); display: flex; flex-shrink: 0; }

        .dbt-body { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
        .dbt-item {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 14px 16px;
        }
        .dbt-item.settled { opacity: 0.72; }
        .dbt-item-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .dbt-person { font-weight: 600; font-size: 14.5px; }
        .dbt-concept { font-size: 12.5px; color: var(--muted); margin-top: 1px; }
        .dbt-amounts { text-align: right; flex-shrink: 0; }
        .dbt-out {
          font-family: var(--font-mono); font-variant-numeric: tabular-nums;
          font-size: 16px; font-weight: 600; color: var(--negative);
        }
        .dbt-item.settled .dbt-out { color: var(--brand); }
        .dbt-of { font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); margin-top: 1px; }
        .dbt-settled-chip {
          display: inline-flex; align-items: center; gap: 4px;
          font-family: var(--font-mono); font-size: 10.5px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em; color: var(--brand);
          background: var(--brand-soft); padding: 3px 8px; border-radius: 999px;
        }
        .dbt-track {
          height: 6px; border-radius: 999px; background: var(--surface-2);
          border: 1px solid var(--border); overflow: hidden; margin-top: 11px;
        }
        .dbt-fill { height: 100%; border-radius: 999px; background: var(--brand); }
        .dbt-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
        .dbt-btn {
          font-family: var(--font-ui); font-size: 12px; background: var(--surface);
          border: 1px solid var(--border); color: var(--text); border-radius: 9px;
          padding: 7px 11px; min-height: 34px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 5px;
        }
        .dbt-btn:hover { background: var(--surface-2); }
        .dbt-btn.danger { color: var(--negative); }
        .dbt-btn.danger:hover { background: var(--negative-soft); }
        .dbt-btn.primary { background: var(--brand); color: #fff; border-color: transparent; }
        .dbt-btn.primary:hover { background: var(--brand-strong); }

        .dbt-pay-form, .dbt-new-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .dbt-pay-form { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
        .dbt-new {
          background: var(--surface); border: 1px dashed var(--border);
          border-radius: var(--radius-sm); padding: 14px 16px;
        }
        .dbt-input {
          font-family: var(--font-ui); font-size: 13.5px; padding: 9px 10px; min-height: 38px;
          border: 1px solid var(--border); border-radius: 9px;
          background: var(--surface-2); color: var(--text);
        }
        .dbt-input.num { font-family: var(--font-mono); width: 130px; }
        .dbt-input.grow { flex: 1; min-width: 140px; }
        .dbt-payments { margin-top: 10px; border-top: 1px solid var(--border); padding-top: 8px; }
        .dbt-pay-row {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          font-family: var(--font-mono); font-size: 12px; color: var(--muted); padding: 4px 0;
        }
        .dbt-pay-del { background: none; border: none; color: var(--muted); cursor: pointer; padding: 3px; border-radius: 6px; display: inline-flex; }
        .dbt-pay-del:hover { color: var(--negative); background: var(--negative-soft); }
        .dbt-empty { font-size: 13px; color: var(--muted); padding: 6px 2px; }
      `}</style>

      <div
        className="dbt-head"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
        aria-expanded={open}
      >
        <div className="dbt-head-left">
          <span className="dbt-head-icon"><HandCoins size={18} /></span>
          <div>
            <div className="dbt-head-title">Deudas por cobrar</div>
            <div className="dbt-head-sub">
              {totalReceivable > 0 ? <>Te deben <b>{formatSoles(totalReceivable)}</b></> : "Nadie te debe por ahora"}
              {debts.length > 0 && ` · ${debts.length} ${debts.length === 1 ? "registro" : "registros"}`}
            </div>
          </div>
        </div>
        <span className="dbt-chev">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="dbt-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{ overflow: "hidden" }}
          >
            {debts.length === 0 && !adding && (
              <div className="dbt-empty">Registra a quién le prestaste para llevar la cuenta.</div>
            )}

            {debts.map((d) => {
              const paidPct = d.amount > 0 ? Math.min(100, ((d.amount - d.outstanding) / d.amount) * 100) : 0;
              const isPaying = payingId === d.id;
              const isEditing = editingId === d.id;
              return (
                <div key={d.id} className={"dbt-item" + (d.isSettled ? " settled" : "")}>
                  <div className="dbt-item-top">
                    <div style={{ minWidth: 0 }}>
                      <div className="dbt-person">{d.person}</div>
                      {d.concept && <div className="dbt-concept">{d.concept}</div>}
                    </div>
                    <div className="dbt-amounts">
                      {d.isSettled ? (
                        <span className="dbt-settled-chip"><Check size={11} /> Saldada</span>
                      ) : (
                        <>
                          <div className="dbt-out">{formatSoles(d.outstanding)}</div>
                          <div className="dbt-of">de {formatSoles(d.amount)}</div>
                        </>
                      )}
                    </div>
                  </div>

                  {!d.isSettled && (
                    <div className="dbt-track">
                      <div className="dbt-fill" style={{ width: paidPct + "%" }} />
                    </div>
                  )}

                  <div className="dbt-actions">
                    {!d.isSettled && !isPaying && !isEditing && (
                      <button className="dbt-btn primary" onClick={() => { setPayingId(d.id); setEditingId(null); setPayAmount(""); }}>
                        <HandCoins size={13} /> Registrar pago
                      </button>
                    )}
                    {!isEditing && (
                      <button className="dbt-btn" onClick={() => startEdit(d)}>
                        <Pencil size={13} /> Editar
                      </button>
                    )}
                    <button
                      className="dbt-btn danger"
                      onClick={() => props.onRequestDelete({ kind: "debt", id: d.id, person: d.person })}
                    >
                      <X size={13} /> Eliminar
                    </button>
                  </div>

                  {isEditing && (
                    <div className="dbt-pay-form">
                      <input
                        className="dbt-input grow"
                        type="text"
                        placeholder="¿Quién te debe?"
                        value={editPerson}
                        onChange={(e) => setEditPerson(e.target.value)}
                        autoFocus
                        aria-label={`Editar nombre de ${d.person}`}
                      />
                      <input
                        className="dbt-input num"
                        type="number"
                        placeholder="Monto"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        aria-label={`Editar monto de la deuda de ${d.person}`}
                      />
                      <input
                        className="dbt-input grow"
                        type="text"
                        placeholder="Concepto (opcional)"
                        value={editConcept}
                        onChange={(e) => setEditConcept(e.target.value)}
                        aria-label={`Editar concepto de la deuda de ${d.person}`}
                      />
                      <button className="dbt-btn primary" onClick={() => handleUpdate(d.id)}>
                        <Check size={13} /> Guardar
                      </button>
                      <button className="dbt-btn" onClick={() => setEditingId(null)}>
                        <X size={13} /> Cancelar
                      </button>
                    </div>
                  )}

                  {isPaying && (
                    <div className="dbt-pay-form">
                      <input
                        className="dbt-input num"
                        type="number"
                        placeholder="Monto pagado"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        autoFocus
                        aria-label={`Monto pagado por ${d.person}`}
                      />
                      <button className="dbt-btn primary" onClick={() => handlePay(d.id)}>
                        <Check size={13} /> Confirmar
                      </button>
                      <button className="dbt-btn" onClick={() => { setPayingId(null); setPayAmount(""); }}>
                        <X size={13} /> Cancelar
                      </button>
                    </div>
                  )}

                  {d.payments.length > 0 && (
                    <div className="dbt-payments">
                      {d.payments.map((p) => (
                        <div key={p.id} className="dbt-pay-row">
                          <span>Pago · {new Date(p.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "var(--brand)" }}>+{formatSoles(p.amount)}</span>
                            <button
                              className="dbt-pay-del"
                              aria-label="Eliminar pago"
                              onClick={() => props.onRequestDelete({ kind: "debt-payment", debtId: d.id, paymentId: p.id })}
                            >
                              <Trash2 size={12} />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {adding ? (
              <div className="dbt-new">
                <div className="dbt-new-form">
                  <input
                    className="dbt-input grow"
                    type="text"
                    placeholder="¿Quién te debe?"
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                    autoFocus
                    aria-label="Nombre de quién te debe"
                  />
                  <input
                    className="dbt-input num"
                    type="number"
                    placeholder="Monto"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-label="Monto de la deuda"
                  />
                  <input
                    className="dbt-input grow"
                    type="text"
                    placeholder="Concepto (opcional)"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                    aria-label="Concepto de la deuda"
                  />
                  <button className="dbt-btn primary" onClick={handleCreate}>
                    <Check size={13} /> Guardar
                  </button>
                  <button className="dbt-btn" onClick={() => { setAdding(false); setPerson(""); setConcept(""); setAmount(""); }}>
                    <X size={13} /> Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button className="dbt-btn" style={{ alignSelf: "flex-start" }} onClick={() => setAdding(true)}>
                <Plus size={14} /> Nueva deuda
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
