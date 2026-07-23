"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Check, ChevronDown, ChevronUp, HandCoins, Trash2, Pencil, TrendingUp } from "lucide-react";
import { createDebt, addDebtPayment, updateDebt, applyDebtPaymentToGoal } from "@/features/debts/actions";
import type { DeleteTarget } from "@/components/DeleteConfirmModal";

interface DebtPaymentData {
  id: string;
  amount: number;
  description: string | null;
  createdAt: string;
  appliedToGoalId?: string | null;
  appliedToGoalTitle?: string | null;
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

export interface SimulationTargetGoal {
  id: string;
  title: string;
  icon: string;
  targetAmount: number;
  isCompleted: boolean;
}

interface DebtsSectionProps {
  debts: DebtData[];
  totalReceivable: number;
  formatSoles: (n: number) => string;
  onChanged: () => Promise<void> | void;
  onError: (msg: string) => void;
  onRequestDelete: (target: DeleteTarget) => void;
  goals: SimulationTargetGoal[];
  simulation: { debtId: string; goalId: string } | null;
  onSimulate: (debtId: string, goalId: string) => void;
  onClearSimulation: () => void;
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
  const [payGoalId, setPayGoalId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerson, setEditPerson] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [simSelectId, setSimSelectId] = useState<string | null>(null);

  const simulableGoals = props.goals.filter((g) => g.targetAmount > 0 && !g.isCompleted);

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
    const res = payGoalId
      ? await applyDebtPaymentToGoal(debtId, payGoalId, { amount: amt })
      : await addDebtPayment(debtId, { amount: amt });
    if (res.success) {
      setPayingId(null);
      setPayAmount("");
      setPayGoalId("");
      await props.onChanged();
    } else {
      props.onError(res.error ?? "Error al registrar el pago");
    }
  }

  return (
    <section className="dbt-root">
      <style>{`
        .dbt-root { margin-top: clamp(var(--sp-6), 6vw, var(--sp-7)); }
        .dbt-head {
          display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
          padding: var(--sp-4) var(--sp-4); background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--r-md); box-shadow: var(--e-1); cursor: pointer;
          transition: border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
        }
        .dbt-head:hover { border-color: var(--brand); box-shadow: var(--e-2); }
        .dbt-head:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
        .dbt-head-left { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }
        .dbt-head-icon {
          width: 40px; height: 40px; border-radius: var(--r-sm); background: var(--brand-soft);
          color: var(--brand); display: grid; place-items: center; flex-shrink: 0;
        }
        .dbt-head-title { font-family: var(--font-display); font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
        .dbt-head-sub { font-family: var(--font-ui); font-size: 12px; color: var(--muted); margin-top: 2px; }
        .dbt-head-right { display: flex; align-items: center; gap: var(--sp-3); flex-shrink: 0; }
        .dbt-total { text-align: right; }
        .dbt-total-label {
          font-family: var(--font-ui); font-size: 10.5px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--muted);
        }
        .dbt-total-amount {
          font-family: var(--font-mono); font-variant-numeric: tabular-nums;
          font-size: 19px; font-weight: 600; color: var(--positive); letter-spacing: -0.01em; margin-top: 1px;
        }
        .dbt-total-amount.zero { color: var(--muted); }
        .dbt-chev { color: var(--muted); display: flex; flex-shrink: 0; }

        .dbt-body { margin-top: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); }
        .dbt-item {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--r-md); box-shadow: var(--e-1); padding: var(--sp-4);
        }
        .dbt-item.settled { opacity: 0.72; }
        .dbt-item-top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-3); }
        .dbt-person { font-family: var(--font-ui); font-weight: 600; font-size: 14.5px; }
        .dbt-concept { font-family: var(--font-ui); font-size: 12.5px; color: var(--muted); margin-top: 2px; }
        .dbt-amounts { text-align: right; flex-shrink: 0; }
        .dbt-out {
          font-family: var(--font-mono); font-variant-numeric: tabular-nums;
          font-size: 16px; font-weight: 600; color: var(--positive);
        }
        .dbt-item.settled .dbt-out { color: var(--brand); }
        .dbt-of { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 11.5px; color: var(--muted); margin-top: 2px; }
        .dbt-settled-chip {
          display: inline-flex; align-items: center; gap: var(--sp-1);
          font-family: var(--font-mono); font-size: 10.5px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em; color: var(--brand);
          background: var(--brand-soft); padding: var(--sp-1) var(--sp-2); border-radius: var(--r-pill);
        }
        .dbt-track {
          height: 6px; border-radius: var(--r-pill); background: var(--surface-2);
          border: 1px solid var(--border); overflow: hidden; margin-top: var(--sp-3);
        }
        .dbt-fill { height: 100%; border-radius: var(--r-pill); background: var(--brand); transition: width var(--dur-base) var(--ease); }
        .dbt-actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-3); }
        .dbt-btn {
          font-family: var(--font-ui); font-size: 12px; background: var(--surface);
          border: 1px solid var(--border); color: var(--text); border-radius: var(--r-sm);
          padding: var(--sp-2) var(--sp-3); min-height: 34px; cursor: pointer;
          display: inline-flex; align-items: center; gap: var(--sp-1);
          transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }
        .dbt-btn:hover { background: var(--surface-2); border-color: var(--brand); }
        .dbt-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
        .dbt-btn.danger { color: var(--negative); }
        .dbt-btn.danger:hover { background: var(--negative-soft); border-color: var(--negative); }
        .dbt-btn.primary { background: var(--brand); color: #fff; border-color: transparent; }
        .dbt-btn.primary:hover { background: var(--brand-strong); border-color: transparent; }

        .dbt-pay-form, .dbt-new-form { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; }
        .dbt-pay-form { margin-top: var(--sp-3); padding-top: var(--sp-3); border-top: 1px solid var(--border); }
        .dbt-new {
          background: var(--surface-2); border: 1px dashed var(--border);
          border-radius: var(--r-md); padding: var(--sp-4);
        }
        .dbt-input {
          font-family: var(--font-ui); font-size: 13.5px; padding: var(--sp-2) var(--sp-3); min-height: 38px;
          border: 1px solid var(--border); border-radius: var(--r-sm);
          background: var(--surface); color: var(--text);
          transition: border-color var(--dur-fast) var(--ease);
        }
        .dbt-input:focus-visible { outline: none; border-color: var(--brand); }
        .dbt-input.num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; width: 130px; }
        .dbt-input.grow { flex: 1; min-width: 140px; }
        .dbt-payments { margin-top: var(--sp-3); border-top: 1px solid var(--border); padding-top: var(--sp-2); }
        .dbt-pay-row {
          display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2);
          font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 12px; color: var(--muted); padding: var(--sp-1) 0;
        }
        .dbt-pay-del { background: none; border: none; color: var(--muted); cursor: pointer; padding: 3px; border-radius: var(--r-sm); display: inline-flex; transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease); }
        .dbt-pay-del:hover { color: var(--negative); background: var(--negative-soft); }
        .dbt-empty { font-family: var(--font-ui); font-size: 13px; color: var(--muted); padding: var(--sp-2); }

        @media (prefers-reduced-motion: reduce) {
          .dbt-head, .dbt-fill, .dbt-btn, .dbt-input, .dbt-pay-del { transition: none; }
        }
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
              {debts.length > 0
                ? `${debts.length} ${debts.length === 1 ? "registro" : "registros"}`
                : "Nadie te debe por ahora"}
            </div>
          </div>
        </div>
        <div className="dbt-head-right">
          <div className="dbt-total">
            <div className="dbt-total-label">Por cobrar</div>
            <div className={"dbt-total-amount" + (totalReceivable > 0 ? "" : " zero")}>
              {formatSoles(totalReceivable)}
            </div>
          </div>
          <span className="dbt-chev">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
        </div>
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
              const isSimSelecting = simSelectId === d.id;
              const activeSimGoal = props.simulation?.debtId === d.id
                ? simulableGoals.find((g) => g.id === props.simulation!.goalId)
                : null;
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
                      <button className="dbt-btn primary" onClick={() => { setPayingId(d.id); setEditingId(null); setPayAmount(""); setPayGoalId(""); }}>
                        <HandCoins size={13} /> Registrar pago
                      </button>
                    )}
                    {!isEditing && (
                      <button className="dbt-btn" onClick={() => startEdit(d)}>
                        <Pencil size={13} /> Editar
                      </button>
                    )}
                    {!d.isSettled && !isSimSelecting && !activeSimGoal && simulableGoals.length > 0 && (
                      <button className="dbt-btn" onClick={() => setSimSelectId(d.id)}>
                        <TrendingUp size={13} /> Simular
                      </button>
                    )}
                    <button
                      className="dbt-btn danger"
                      onClick={() => props.onRequestDelete({ kind: "debt", id: d.id, person: d.person })}
                    >
                      <X size={13} /> Eliminar
                    </button>
                  </div>

                  {isSimSelecting && !activeSimGoal && (
                    <div className="dbt-pay-form">
                      <select
                        className="dbt-input grow"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            props.onSimulate(d.id, e.target.value);
                            setSimSelectId(null);
                          }
                        }}
                        aria-label={`Elegir meta para simular el pago de ${d.person}`}
                        autoFocus
                      >
                        <option value="" disabled>Elegir meta…</option>
                        {simulableGoals.map((g) => (
                          <option key={g.id} value={g.id}>{g.icon} {g.title}</option>
                        ))}
                      </select>
                      <button className="dbt-btn" onClick={() => setSimSelectId(null)}>
                        <X size={13} /> Cancelar
                      </button>
                    </div>
                  )}

                  {activeSimGoal && (
                    <div className="dbt-pay-form">
                      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                        Simulando en: <strong style={{ color: "var(--text)" }}>{activeSimGoal.icon} {activeSimGoal.title}</strong>
                      </span>
                      <button className="dbt-btn" onClick={() => props.onClearSimulation()}>
                        <X size={13} /> Quitar
                      </button>
                    </div>
                  )}

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
                      {simulableGoals.length > 0 && (
                        <select
                          className="dbt-input grow"
                          value={payGoalId}
                          onChange={(e) => setPayGoalId(e.target.value)}
                          aria-label={`Aplicar el pago de ${d.person} como depósito a una meta (opcional)`}
                        >
                          <option value="">Registrar como cobro (sin aportar a meta)</option>
                          {simulableGoals.map((g) => (
                            <option key={g.id} value={g.id}>Aportar a: {g.icon} {g.title}</option>
                          ))}
                        </select>
                      )}
                      <button className="dbt-btn primary" onClick={() => handlePay(d.id)}>
                        <Check size={13} /> Confirmar
                      </button>
                      <button className="dbt-btn" onClick={() => { setPayingId(null); setPayAmount(""); setPayGoalId(""); }}>
                        <X size={13} /> Cancelar
                      </button>
                    </div>
                  )}

                  {d.payments.length > 0 && (
                    <div className="dbt-payments">
                      {d.payments.map((p) => (
                        <div key={p.id} className="dbt-pay-row">
                          <span>
                            Pago · {new Date(p.createdAt).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                            {p.appliedToGoalTitle && (
                              <span style={{ color: "var(--brand)", marginLeft: 6 }}>
                                &rarr; aportado a {p.appliedToGoalTitle}
                              </span>
                            )}
                          </span>
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
