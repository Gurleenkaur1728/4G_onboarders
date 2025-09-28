// src/pages/Questions.jsx
import { useEffect, useState } from "react";
import Sidebar, { ROLES } from "../components/Sidebar.jsx";
import { HelpCircle, Send, MessageSquare, Pencil, Trash2, Save, X } from "lucide-react";
import { supabase } from "../../src/lib/supabaseClient"

export default function Questions() {
  const [tab, setTab] = useState("faqs");
  const [faqs, setFaqs] = useState([]);
  const [myQuestions, setMyQuestions] = useState([]);
  const [newQ, setNewQ] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [profileId, setProfileId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roleId] = useState(() => Number(localStorage.getItem("role_id") ?? 0));

  // inline edit
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (ignore) return;
      setAuthUser(user ?? null);
      if (user?.email) {
        const { data: profile } = await supabase
          .from("users")
          .select("id")
          .ilike("email", user.email)
          .maybeSingle();
      setProfileId(profile?.id || null);
    }
      setLoading(false);
    })();
    return () => { ignore = true; };
  }, []);

  // FAQs (published)
  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data, error } = await supabase
        .from("faqs")
        .select("id, question, answer")
        .eq("is_published", true)
        .order("id", { ascending: true });
      if (!ignore && !error) setFaqs(data ?? []);
    })();
    return () => { ignore = true; };
  }, []);

  // My questions
  const loadMine = async (profileId) => {
    const { data, error } = await supabase
      .from("user_questions")
      .select("id, question_text, answer_text, status, created_at, updated_at")
      .eq("user_id", profileId)
      .order("created_at", { ascending: false });
    if (!error) setMyQuestions(data ?? []);
  };

  useEffect(() => {
    if (!profileId) return;
    loadMine(profileId);

    // realtime updates on my rows
    const channel = supabase
      .channel("uq-self")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_questions", 
          filter: `user_id=eq.${profileId}` },
        () => loadMine(profileId)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profileId]);

  const askQuestion = async () => {
    if (!newQ.trim() || !authUser) return;
    if (!profileId) { alert("No profile found for your account."); return; }
    const payload = { user_id: profileId, question_text: newQ.trim(), status: "open" };
    const { data, error } = await supabase
      .from("user_questions")
      .insert(payload)
      .select("id, question_text, answer_text, status, created_at, updated_at")
      .single();
    if (!error && data) {
      setMyQuestions(prev => [data, ...prev]);
      setNewQ("");
    }
  };

  const startEdit = (q) => {
    setEditingId(q.id);
    setEditingText(q.question_text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const saveEdit = async () => {
    if (!editingId || !editingText.trim()) return;
    const { data, error } = await supabase
      .from("user_questions")
      .update({ question_text: editingText.trim() })
      .eq("id", editingId)
      .select("id, question_text, answer_text, status, created_at, updated_at")
      .single();
    if (!error && data) {
      setMyQuestions(prev => prev.map(x => x.id === data.id ? data : x));
      cancelEdit();
    } else if (error?.code === "42501") {
      alert("You can only edit your own OPEN questions.");
    }
  };

  const removeQuestion = async (id) => {
    const row = myQuestions.find(r => r.id === id);
    if (!row) return;
    if (row.status !== "open") {
      alert("Only OPEN questions can be deleted.");
      return;
    }
    const { error } = await supabase.from("user_questions").delete().eq("id", id);
    if (!error) setMyQuestions(prev => prev.filter(x => x.id !== id));
  };

  if (loading) return <div className="p-6 text-emerald-900">Loading…</div>;

  return (
    <div className="flex min-h-dvh bg-cover bg-center relative" style={{ backgroundImage: "url('/bg.png')" }}>
      {/* role read from localStorage, default USER */}
      <Sidebar role={[1,2].includes(roleId) ? roleId : ROLES.USER} />

      <div className="flex-1 flex flex-col p-6">
        <div className="flex items-center justify-between bg-emerald-100/90 rounded-md px-4 py-2 mb-4 shadow">
          <span className="text-emerald-950 font-semibold">Questions & FAQs</span>
        </div>

        <div className="bg-emerald-900/95 px-6 py-4 rounded-xl mb-4 shadow-lg text-emerald-100 font-extrabold border border-emerald-400/70 text-2xl">
          QUESTIONS
        </div>

        <div className="flex gap-2 mb-6">
          <Tab label="FAQs" active={tab === "faqs"} onClick={() => setTab("faqs")} />
          <Tab label="Ask Question" active={tab === "ask"} onClick={() => setTab("ask")} />
        </div>

        {tab === "faqs" ? (
          <FaqsTab faqs={faqs} />
        ) : (
          <AskQuestionTab
            myQuestions={myQuestions}
            newQ={newQ}
            setNewQ={setNewQ}
            askQuestion={askQuestion}
            editingId={editingId}
            editingText={editingText}
            setEditingText={setEditingText}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            saveEdit={saveEdit}
            removeQuestion={removeQuestion}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Subcomponents ---------- */
function FaqsTab({ faqs }) {
  return (
    <div className="space-y-4">
      {faqs.map((faq) => (
        <div key={faq.id} className="bg-emerald-900/80 text-emerald-100 rounded-lg shadow-lg p-4 border border-emerald-400/40">
          <h3 className="font-bold flex items-center gap-2">
            <HelpCircle size={16} className="text-emerald-300" /> {faq.question}
          </h3>
          <p className="text-sm text-emerald-200/80 mt-1">{faq.answer}</p>
        </div>
      ))}
      {faqs.length === 0 && <div className="text-emerald-800 italic">No FAQs yet.</div>}
    </div>
  );
}

function AskQuestionTab({
  myQuestions, newQ, setNewQ, askQuestion,
  editingId, editingText, setEditingText, startEdit, cancelEdit, saveEdit, removeQuestion
}) {
  return (
    <div className="space-y-6">
      {/* Ask form */}
      <div className="bg-emerald-900/90 text-emerald-100 rounded-lg shadow-lg p-4 border border-emerald-400/60 space-y-3">
        <h3 className="font-bold flex items-center gap-2">
          <MessageSquare size={18} className="text-emerald-300" /> Ask a New Question
        </h3>
        <textarea
          value={newQ}
          onChange={(e) => setNewQ(e.target.value)}
          placeholder="Type your question here..."
          rows={3}
          className="w-full px-3 py-2 rounded-md border border-emerald-700 bg-emerald-900/40 text-white"
        />
        <button
          onClick={askQuestion}
          className="px-4 py-2 rounded-md bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold shadow hover:scale-105 transition"
        >
          <Send size={16} className="inline mr-1" /> Submit
        </button>
      </div>

      {/* My Questions */}
      <div className="overflow-x-auto rounded-lg border border-emerald-400/70 shadow-lg bg-white">
        <table className="min-w-[700px] w-full border-collapse">
          <thead>
            <tr className="bg-emerald-900/95 text-left text-emerald-100">
              <Th>Question</Th>
              <Th>Answer</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {myQuestions.map((q, idx) => (
              <tr key={q.id} className={`text-emerald-950 text-sm ${idx % 2 === 0 ? "bg-emerald-50/90" : "bg-emerald-100/80"}`}>
                <td className="px-4 py-3">
                  {editingId === q.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editingText}
                        onChange={(e)=>setEditingText(e.target.value)}
                        className="w-full px-2 py-1 rounded border border-emerald-600"
                      />
                    </div>
                  ) : (
                    q.question_text
                  )}
                </td>
                <td className="px-4 py-3">
                  {q.answer_text ? (
                    <span className="text-emerald-700 font-medium">{q.answer_text}</span>
                  ) : (
                    <span className="text-gray-400 italic">No answer yet</span>
                  )}
                </td>
                <td className="px-4 py-3 capitalize">{q.status}</td>
                <td className="px-4 py-3">
                  {q.status === "open" ? (
                    editingId === q.id ? (
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="px-2 py-1 rounded bg-emerald-600 text-white flex items-center gap-1">
                          <Save size={14}/> Save
                        </button>
                        <button onClick={cancelEdit} className="px-2 py-1 rounded bg-gray-200 text-gray-800 flex items-center gap-1">
                          <X size={14}/> Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={()=>startEdit(q)} className="px-2 py-1 rounded bg-emerald-600 text-white flex items-center gap-1">
                          <Pencil size={14}/> Edit
                        </button>
                        <button onClick={()=>removeQuestion(q.id)} className="px-2 py-1 rounded bg-red-600 text-white flex items-center gap-1">
                          <Trash2 size={14}/> Delete
                        </button>
                      </div>
                    )
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {myQuestions.length === 0 && (
          <div className="p-4 text-sm text-emerald-800">You haven't asked any questions yet.</div>
        )}
      </div>
    </div>
  );
}

function Tab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-300
        ${active
          ? "bg-gradient-to-r from-emerald-400 to-green-500 text-emerald-950 shadow-md scale-105"
          : "bg-emerald-800/70 text-emerald-100 hover:bg-emerald-700/80 hover:scale-105"
        }`}
    >
      {label}
    </button>
  );
}
function Th({ children }) {
  return <th className="px-4 py-3 font-bold border-r border-emerald-800/50">{children}</th>;
}
