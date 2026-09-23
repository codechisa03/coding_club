import { useEffect, useState } from "react";
import { Search, ShieldCheck, Eye, Trash2, Download, FileText } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import AdminLayout from "../../components/AdminLayout";
import Skeleton from "../../components/ui/Skeleton";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";
import { apiFetch, ApiError } from "../../lib/api";
import StudentDetailModal from "../../components/admin/StudentDetailModal";

// Admin-only table of REGISTERED accounts — students who signed up
// (username + password) via Sign Up. Students who only ever attended a quiz
// without creating an account live in Admin -> Guest Accounts instead.
// Deliberately shows no password anywhere -- the backend endpoint this calls
// never selects password_hash in the first place, so there is nothing
// sensitive to leak even if this component were changed later. Click a row,
// or its View button, to see the account's complete dashboard (profile,
// quizzes, programs, attendance and activity) and quiz history; Delete
// permanently removes the account after a confirmation step.
export default function AdminUserAccounts() {
  const { token } = useAdminAuth();
  const { push } = useToast();

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [viewingId, setViewingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      apiFetch(
        `/admin/students?accountType=registered&limit=500${
          query.trim() ? `&search=${encodeURIComponent(query.trim())}` : ""
        }`,
        { token }
      )
        .then((data) => setStudents(data.students || []))
        .catch((err) => {
          const message = err instanceof ApiError ? err.message : "Failed to load user accounts";
          setError(message);
          push(message, "error");
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token]);

  const handleRemoveFromList = (id) => {
    setStudents((prev) => prev.filter((s) => s.id !== id));
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/admin/students/${deleteTarget.id}`, { method: "DELETE", token });
      push(`Deleted account for ${deleteTarget.name}`, "success");
      handleRemoveFromList(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      push(err instanceof ApiError ? err.message : "Failed to delete account", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadCSV = () => {
    if (students.length === 0) return;
    const header = "Enrollment Number,Name,Batch,Department,Section\n";
    const escapeCsv = (str) => `"${String(str || "").replace(/"/g, '""')}"`;
    const rows = students.map((s) =>
      [s.registerNumber, s.name, s.batch, s.department, s.section].map(escapeCsv).join(",")
    ).join("\n");

    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "registered_students.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = () => {
    if (students.length === 0) return;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Registered Students", 14, 15);
    doc.setFontSize(10);
    doc.text(`Total Accounts: ${students.length}`, 14, 22);

    const tableColumn = ["Enrollment No.", "Name", "Batch", "Dept", "Section"];
    const tableRows = students.map((s) => [
      s.registerNumber || "-",
      s.name || "-",
      s.batch || "-",
      s.department || "-",
      s.section || "-",
    ]);

    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 25,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [139, 92, 246] },
    });

    doc.save("registered_students.pdf");
  };

  return (
    <AdminLayout title="User Accounts" subtitle="Registered accounts only — View for full details, or Delete to remove permanently">
      <div className="mb-5 flex items-center gap-2 rounded-xl bg-electric/5 px-4 py-3 text-xs text-ink-500">
        <ShieldCheck className="h-3.5 w-3.5 flex-none text-electric-light" />
        Passwords are stored as one-way hashes and are never returned by the API or displayed here.
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by enrollment number or name..."
            aria-label="Search user accounts"
            className="glass w-full rounded-xl py-2.5 pl-10 pr-4 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40"
          />
        </div>
        <div className="flex items-center justify-between flex-wrap w-full gap-3">
          <span className="text-xs text-ink-500 font-medium">{loading ? "Loading…" : `${students.length} accounts`}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCSV}
              disabled={students.length === 0 || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-ink-200/5 px-3 py-2 text-xs font-medium text-ink-100 transition-colors hover:bg-ink-200/10 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={students.length === 0 || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-violet/10 px-3 py-2 text-xs font-medium text-violet-soft transition-colors hover:bg-violet/20 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" /> PDF
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : error ? (
        <div className="glass-card p-6 text-sm text-coral">{error}</div>
      ) : students.length === 0 ? (
        <div className="glass-card p-10 text-center text-sm text-ink-500">No registered accounts found.</div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2.5">Enrollment Number</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Batch</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setViewingId(s.id)}
                  className="cursor-pointer border-b border-slate-200 transition-colors last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5 font-tabular text-ink-100">{s.registerNumber}</td>
                  <td className="px-4 py-2.5 text-ink-100">{s.name}</td>
                  <td className="px-4 py-2.5 text-ink-500">{s.batch ? s.batch.replace("-", "\u2013") : "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingId(s.id);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-electric/10 px-2.5 py-1.5 text-xs font-medium text-electric-light transition-colors hover:bg-electric/20"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(s);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-coral/10 px-2.5 py-1.5 text-xs font-medium text-coral transition-colors hover:bg-coral/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StudentDetailModal
        studentId={viewingId}
        onClose={() => setViewingId(null)}
        token={token}
        push={push}
        onDeleted={handleRemoveFromList}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this user account?"
        description={
          deleteTarget
            ? `This permanently deletes ${deleteTarget.name} (${deleteTarget.registerNumber}) along with every quiz attempt, answer, attendance record and activity log entry on file. This cannot be undone.`
            : ""
        }
        confirmLabel={deleting ? "Deleting…" : "Delete permanently"}
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </AdminLayout>
  );
}
