import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../api/index.js";

export default function AdminQmsExpansion({ currentRole }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [auditPrograms, setAuditPrograms] = useState([]);
  const [courses, setCourses] = useState([]);
  const [cocs, setCocs] = useState([]);
  const [supplierScorecards, setSupplierScorecards] = useState({});

  const [docForm, setDocForm] = useState({ documentNumber: "", title: "", category: "" });
  const [supplierForm, setSupplierForm] = useState({
    supplierCode: "",
    name: "",
    status: "approved"
  });
  const [programForm, setProgramForm] = useState({ name: "", scope: "", cadence: "" });
  const [courseForm, setCourseForm] = useState({ code: "", title: "", refreshIntervalDays: "" });
  const [cocForm, setCocForm] = useState({
    customerName: "",
    purchaseOrder: "",
    specReference: "",
    statementTemplate: "Conformance for {{customer}} / PO {{po}} per {{spec}}."
  });

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [docRows, supplierRows, programRows, courseRows, cocRows] = await Promise.all([
        api.qms.documents.list(currentRole || "Admin"),
        api.qms.suppliers.list(currentRole || "Admin"),
        api.qms.internalAudits.listPrograms(currentRole || "Admin"),
        api.qms.training.listCourses(currentRole || "Admin"),
        api.qms.coc.list(currentRole || "Admin")
      ]);
      setDocuments(Array.isArray(docRows) ? docRows : []);
      setSuppliers(Array.isArray(supplierRows) ? supplierRows : []);
      setAuditPrograms(Array.isArray(programRows) ? programRows : []);
      setCourses(Array.isArray(courseRows) ? courseRows : []);
      setCocs(Array.isArray(cocRows) ? cocRows : []);
    } catch (e) {
      setError(e?.message || "Unable to load QMS expansion data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [currentRole]);

  async function createDocument(event) {
    event.preventDefault();
    try {
      await api.qms.documents.create(docForm, currentRole || "Admin");
      setDocForm({ documentNumber: "", title: "", category: "" });
      await loadAll();
    } catch (e) {
      setError(e?.message || "Unable to create document.");
    }
  }

  async function createSupplier(event) {
    event.preventDefault();
    try {
      await api.qms.suppliers.create(supplierForm, currentRole || "Admin");
      setSupplierForm({ supplierCode: "", name: "", status: "approved" });
      await loadAll();
    } catch (e) {
      setError(e?.message || "Unable to create supplier.");
    }
  }

  async function loadSupplierScorecard(supplierId) {
    try {
      const scorecard = await api.qms.suppliers.scorecard(supplierId, currentRole || "Admin");
      setSupplierScorecards((prev) => ({ ...prev, [supplierId]: scorecard }));
    } catch (e) {
      setError(e?.message || "Unable to load supplier scorecard.");
    }
  }

  async function createAuditProgram(event) {
    event.preventDefault();
    try {
      await api.qms.internalAudits.createProgram(programForm, currentRole || "Admin");
      setProgramForm({ name: "", scope: "", cadence: "" });
      await loadAll();
    } catch (e) {
      setError(e?.message || "Unable to create audit program.");
    }
  }

  async function createCourse(event) {
    event.preventDefault();
    try {
      await api.qms.training.createCourse(
        {
          ...courseForm,
          refreshIntervalDays: courseForm.refreshIntervalDays || null
        },
        currentRole || "Admin"
      );
      setCourseForm({ code: "", title: "", refreshIntervalDays: "" });
      await loadAll();
    } catch (e) {
      setError(e?.message || "Unable to create training course.");
    }
  }

  async function createCoc(event) {
    event.preventDefault();
    try {
      await api.qms.coc.create(cocForm, currentRole || "Admin");
      setCocForm((prev) => ({ ...prev, customerName: "", purchaseOrder: "", specReference: "" }));
      await loadAll();
    } catch (e) {
      setError(e?.message || "Unable to create CoC.");
    }
  }

  async function voidCoc(cocId) {
    const reason = window.prompt("Void reason");
    if (!reason || !reason.trim()) return;
    try {
      await api.qms.coc.void(cocId, { reason: reason.trim() }, currentRole || "Admin");
      await loadAll();
    } catch (e) {
      setError(e?.message || "Unable to void CoC.");
    }
  }

  return (
    <div className="stack3">
      <div className="card">
        <div className="card-head">
          <div className="card-title">QMS Expansion (BL-110..BL-114)</div>
          <button className="btn btn-ghost btn-sm" onClick={loadAll} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {error ? (
          <div className="banner warn" role="alert" style={{ margin: ".2rem .85rem .65rem" }}>
            {error}
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Controlled Documents</div>
        </div>
        <form className="card-body row2" onSubmit={createDocument}>
          <div className="field">
            <label>Doc Number</label>
            <input
              value={docForm.documentNumber}
              required
              onChange={(e) => setDocForm((p) => ({ ...p, documentNumber: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Title</label>
            <input
              value={docForm.title}
              required
              onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Category</label>
            <input
              value={docForm.category}
              onChange={(e) => setDocForm((p) => ({ ...p, category: e.target.value }))}
            />
          </div>
          <div className="gap1" style={{ justifyContent: "flex-end", gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              Add Document
            </button>
          </div>
        </form>
        <table className="data-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Title</th>
              <th>Status</th>
              <th>Revision</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.document_number}</td>
                <td>{item.title}</td>
                <td>{item.status}</td>
                <td>{item.current_revision_code || "—"}</td>
              </tr>
            ))}
            {documents.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">No controlled documents yet.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Suppliers</div>
        </div>
        <form className="card-body row2" onSubmit={createSupplier}>
          <div className="field">
            <label>Supplier Code</label>
            <input
              value={supplierForm.supplierCode}
              required
              onChange={(e) => setSupplierForm((p) => ({ ...p, supplierCode: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Name</label>
            <input
              value={supplierForm.name}
              required
              onChange={(e) => setSupplierForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={supplierForm.status}
              onChange={(e) => setSupplierForm((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="approved">approved</option>
              <option value="conditional">conditional</option>
              <option value="probation">probation</option>
              <option value="disqualified">disqualified</option>
            </select>
          </div>
          <div className="gap1" style={{ justifyContent: "flex-end", gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              Add Supplier
            </button>
          </div>
        </form>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Status</th>
              <th>Scorecard</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.supplier_code}</td>
                <td>{item.name}</td>
                <td>{item.status}</td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => loadSupplierScorecard(item.id)}
                  >
                    Load
                  </button>
                  {supplierScorecards[item.id] ? (
                    <span className="text-muted" style={{ marginLeft: ".45rem" }}>
                      {supplierScorecards[item.id].acceptanceRate}% / NCR{" "}
                      {supplierScorecards[item.id].ncrCount}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">No suppliers yet.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Internal Audit Programs</div>
        </div>
        <form className="card-body row2" onSubmit={createAuditProgram}>
          <div className="field">
            <label>Name</label>
            <input
              value={programForm.name}
              required
              onChange={(e) => setProgramForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Scope</label>
            <input
              value={programForm.scope}
              onChange={(e) => setProgramForm((p) => ({ ...p, scope: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Cadence</label>
            <input
              value={programForm.cadence}
              onChange={(e) => setProgramForm((p) => ({ ...p, cadence: e.target.value }))}
            />
          </div>
          <div className="gap1" style={{ justifyContent: "flex-end", gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              Add Program
            </button>
          </div>
        </form>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Scope</th>
              <th>Cadence</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {auditPrograms.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.scope || "—"}</td>
                <td>{item.cadence || "—"}</td>
                <td>{item.active ? "yes" : "no"}</td>
              </tr>
            ))}
            {auditPrograms.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">No audit programs yet.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Training Courses</div>
        </div>
        <form className="card-body row2" onSubmit={createCourse}>
          <div className="field">
            <label>Code</label>
            <input
              value={courseForm.code}
              required
              onChange={(e) => setCourseForm((p) => ({ ...p, code: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Title</label>
            <input
              value={courseForm.title}
              required
              onChange={(e) => setCourseForm((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Refresh Days</label>
            <input
              type="number"
              min="1"
              value={courseForm.refreshIntervalDays}
              onChange={(e) =>
                setCourseForm((p) => ({ ...p, refreshIntervalDays: e.target.value }))
              }
            />
          </div>
          <div className="gap1" style={{ justifyContent: "flex-end", gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              Add Course
            </button>
          </div>
        </form>
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Title</th>
              <th>Refresh</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.code}</td>
                <td>{item.title}</td>
                <td>{item.refresh_interval_days || "—"}</td>
              </tr>
            ))}
            {courses.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <div className="empty-state">No training courses yet.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Certificates of Conformance</div>
        </div>
        <form className="card-body row2" onSubmit={createCoc}>
          <div className="field">
            <label>Customer</label>
            <input
              value={cocForm.customerName}
              onChange={(e) => setCocForm((p) => ({ ...p, customerName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>PO</label>
            <input
              value={cocForm.purchaseOrder}
              onChange={(e) => setCocForm((p) => ({ ...p, purchaseOrder: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Spec</label>
            <input
              value={cocForm.specReference}
              onChange={(e) => setCocForm((p) => ({ ...p, specReference: e.target.value }))}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Statement Template</label>
            <input
              value={cocForm.statementTemplate}
              onChange={(e) => setCocForm((p) => ({ ...p, statementTemplate: e.target.value }))}
            />
          </div>
          <div className="gap1" style={{ justifyContent: "flex-end", gridColumn: "1 / -1" }}>
            <button className="btn btn-primary" type="submit">
              Issue CoC
            </button>
          </div>
        </form>
        <table className="data-table">
          <thead>
            <tr>
              <th>CoC #</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {cocs.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.coc_number}</td>
                <td>{item.customer_name || "—"}</td>
                <td>{item.status}</td>
                <td>
                  {item.status !== "void" ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => voidCoc(item.id)}>
                      Void
                    </button>
                  ) : (
                    <span className="text-muted">{item.void_reason || "void"}</span>
                  )}
                </td>
              </tr>
            ))}
            {cocs.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">No CoC records yet.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

