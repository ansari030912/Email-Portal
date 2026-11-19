import { useEffect, useState } from "react";
import { KeyRound, Plus, RefreshCw, Copy, Check, AlertTriangle, Plug, Power, Globe, Trash2 } from "lucide-react";
import { EmptyState, Modal, Spinner } from "../../components/ui";
import { createIngestClient, deleteIngestClient, getAllIngestClients, rotateIngestClientSecret, updateIngestClientSettings } from "../../api/endpoints";
import { useStepUp } from "../../context/StepUpContext";
import { useToast } from "../../context/ToastContext";
import { colorFor, copyText, formatFullDate, timeAgo } from "../../utils/format";
import "../../styles/admin.css";

function CopyIcon({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="icon-btn sm"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        }
      }}
      aria-label="Copy"
    >
      {done ? <Check size={15} color="var(--success)" /> : <Copy size={15} />}
    </button>
  );
}

const envSnippet = (creds) =>
  [
    "# beta env of the project",
    "EMAIL_DELIVERY_MODE=portal",
    `EMAIL_PORTAL_URL=${window.location.origin.includes("localhost") ? "http://localhost:5050" : "https://<email-portal-backend>"}`,
    `EMAIL_PORTAL_KEY_ID=${creds.keyId}`,
    `EMAIL_PORTAL_SECRET=${creds.secret}`,
    "EMAIL_PORTAL_PROJECT_URL=https://<project-frontend-url>",
    "EMAIL_PORTAL_ENVIRONMENT=beta",
  ].join("\n");

export default function ProjectsPage() {
  const stepUp = useStepUp();
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", projectKey: "" });
  const [reveal, setReveal] = useState(null);
  const [ipEdit, setIpEdit] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [confirmKey, setConfirmKey] = useState("");

  const closeDelete = () => {
    setToDelete(null);
    setConfirmKey("");
  };

  const remove = async () => {
    const c = toDelete;
    closeDelete();
    const data = await guarded(`Delete ${c.name}?`, "Its key stops working right away.", (twoFactorCode) =>
      deleteIngestClient({ clientId: c._id, twoFactorCode })
    );
    if (data) {
      setClients((l) => l.filter((x) => x._id !== c._id));
      toast.success(data.message);
    }
  };

  const load = () =>
    getAllIngestClients()
      .then((d) => setClients(d.clients))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replace = (c) => setClients((list) => list.map((x) => (x._id === c._id ? c : x)));

  const guarded = async (title, description, action) => {
    try {
      return await stepUp({ title, description, action });
    } catch (err) {
      if (!err.cancelled) toast.error(err.message);
      return null;
    }
  };

  const create = async (e) => {
    e.preventDefault();
    const data = await guarded("Connect a new project", "A new signing key will be created.", (twoFactorCode) =>
      createIngestClient({ ...form, twoFactorCode })
    );
    if (!data) return;
    setClients((l) => [...l, data.client]);
    setCreateOpen(false);
    setForm({ name: "", projectKey: "" });
    setReveal({ client: data.client, credentials: data.credentials });
  };

  const rotate = async (c) => {
    const data = await guarded(`Rotate the secret of ${c.name}?`, "The old secret stops working immediately.", (twoFactorCode) =>
      rotateIngestClientSecret({ clientId: c._id, twoFactorCode })
    );
    if (!data) return;
    replace(data.client);
    setReveal({ client: data.client, credentials: data.credentials });
  };

  const toggleActive = async (c) => {
    const data = await guarded(c.isActive ? `Pause ${c.name}?` : `Resume ${c.name}?`, c.isActive ? "Its emails will be refused until resumed." : undefined, (twoFactorCode) =>
      updateIngestClientSettings({ clientId: c._id, isActive: !c.isActive, twoFactorCode })
    );
    if (data) {
      replace(data.client);
      toast.success(data.message);
    }
  };

  const saveIps = async () => {
    const ips = ipEdit.text.split(/[\s,]+/).filter(Boolean);
    const data = await guarded("Update IP allow list", undefined, (twoFactorCode) =>
      updateIngestClientSettings({ clientId: ipEdit.client._id, allowedIps: ips, twoFactorCode })
    );
    if (data) {
      replace(data.client);
      setIpEdit(null);
      toast.success("IP allow list saved");
    }
  };

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1>Projects</h1>
            <p>Backends allowed to save emails here. Each one signs its requests with its own secret.</p>
          </div>
          <div className="spacer" />
          <button className="btn btn-gradient" onClick={() => setCreateOpen(true)}>
            <Plus size={17} /> Connect project
          </button>
        </div>

        {loading ? (
          <div className="full-center" style={{ padding: 60 }}><Spinner size={24} /></div>
        ) : !clients.length ? (
          <div className="card">
            <EmptyState icon={Plug} title="No project connected" action={<button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Connect project</button>}>
              Connect DeFa, PayMate or any new backend to start capturing its beta emails.
            </EmptyState>
          </div>
        ) : (
          <div className="project-grid">
            {clients.map((c) => (
              <div key={c._id} className="card project-card">
                <div className="row">
                  <div className="card-icon" style={{ background: `${colorFor(c.projectKey)}1f`, color: colorFor(c.projectKey) }}>
                    <KeyRound size={18} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b className="truncate" style={{ display: "block", fontSize: 15 }}>{c.name}</b>
                    <span className="mono faint">{c.projectKey}</span>
                  </div>
                  <button className={`switch ${c.isActive ? "on" : ""}`} onClick={() => toggleActive(c)} title={c.isActive ? "Active - click to pause" : "Paused - click to resume"} />
                  <button className="icon-btn sm danger-hover" onClick={() => setToDelete(c)} title="Delete project" aria-label="Delete project">
                    <Trash2 size={16} />
                  </button>
                </div>

                <div>
                  <div className="hint" style={{ marginBottom: 4 }}>Key ID</div>
                  <div className="key-row">
                    <span className="mono">{c.keyId}</span>
                    <CopyIcon text={c.keyId} />
                  </div>
                </div>
                <div>
                  <div className="hint" style={{ marginBottom: 4 }}>Secret</div>
                  <div className="key-row">
                    <span className="mono">ims_••••••••••••••••{c.secretPreview}</span>
                  </div>
                </div>

                <div className="mini-stats">
                  <div><b>{c.emailCount}</b>emails</div>
                  <div><b>{timeAgo(c.lastUsedAt)}</b>last email</div>
                  <div><b>{c.lastUsedIp || "—"}</b>last IP</div>
                </div>

                <div className="row" style={{ flexWrap: "wrap" }}>
                  {c.isActive ? <span className="badge success"><span className="dot" /> Active</span> : <span className="badge danger"><Power size={11} /> Paused</span>}
                  <span className="badge"><Globe size={11} /> {c.allowedIps.length ? `${c.allowedIps.length} allowed IP${c.allowedIps.length > 1 ? "s" : ""}` : "Any IP"}</span>
                  <div className="spacer" />
                  <button className="btn btn-ghost btn-sm" onClick={() => setIpEdit({ client: c, text: c.allowedIps.join("\n") })}>IPs</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => rotate(c)}><RefreshCw size={14} /> Rotate</button>
                </div>
                <div className="hint">Connected {formatFullDate(c.createdAt)}{c.secretRotatedAt ? ` · rotated ${timeAgo(c.secretRotatedAt)}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        icon={Plug}
        title="Connect a project"
        subtitle="The project gets a key to call POST /email-ingest/saveEmail."
      >
        <form onSubmit={create}>
          <div className="field">
            <label>Project name</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. CredMate API" autoFocus />
          </div>
          <div className="field">
            <label>Project key</label>
            <input
              className="input mono"
              value={form.projectKey}
              onChange={(e) => setForm((f) => ({ ...f, projectKey: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}
              placeholder="credmate-api"
            />
            <span className="hint">Lowercase letters, numbers and dashes. Shown on every email of this project.</span>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={!form.name.trim() || form.projectKey.length < 3}>Create key</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!reveal} onClose={() => setReveal(null)} size="lg" icon={KeyRound} title={`${reveal?.client.name} credentials`} subtitle="Add these to the project's beta environment.">
        {reveal && (
          <>
            <div className="secret-reveal">
              <AlertTriangle size={17} style={{ flexShrink: 0 }} /> Copy the secret now - it is stored encrypted and can't be shown again.
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <b style={{ fontSize: 13 }}>.env</b>
              <CopyIcon text={envSnippet(reveal.credentials)} />
            </div>
            <pre className="code">{envSnippet(reveal.credentials)}</pre>
            <p className="hint" style={{ marginTop: 12 }}>
              Copy <span className="mono">email-backend/clients/emailPortalClient.js</span> into the project and call <span className="mono">saveEmailToPortal()</span> before <span className="mono">transporter.sendMail()</span> when <span className="mono">EMAIL_DELIVERY_MODE=portal</span>.
            </p>
          </>
        )}
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={closeDelete}
        icon={Trash2}
        title={`Delete ${toDelete?.name || "project"}?`}
        subtitle="The project can't save emails anymore. Emails it already saved stay in the portal."
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeDelete}>Cancel</button>
            <button className="btn btn-danger" disabled={confirmKey !== toDelete?.projectKey} onClick={remove}>
              <Trash2 size={15} /> Delete project
            </button>
          </>
        }
      >
        {toDelete && (
          <>
            <div className="secret-reveal" style={{ background: "var(--danger-50)", color: "var(--danger)" }}>
              <AlertTriangle size={17} style={{ flexShrink: 0 }} />
              If {toDelete.name} is still in portal mode, its emails will fail until you connect it again with a new key.
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>
                Type <span className="mono" style={{ color: "var(--text)" }}>{toDelete.projectKey}</span> to confirm
              </label>
              <input className="input mono" value={confirmKey} onChange={(e) => setConfirmKey(e.target.value.trim())} autoFocus />
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={!!ipEdit}
        onClose={() => setIpEdit(null)}
        icon={Globe}
        title="IP allow list"
        subtitle="Only these server IPs may push emails. Leave empty to allow any IP (the signature is still required)."
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIpEdit(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveIps}>Save</button>
          </>
        }
      >
        {ipEdit && <textarea className="textarea mono" rows={6} value={ipEdit.text} onChange={(e) => setIpEdit((x) => ({ ...x, text: e.target.value }))} placeholder={"34.120.10.5\n10.0.0.12"} />}
      </Modal>
    </div>
  );
}
