"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/client";
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES, type Profile, getInitials } from "@/lib/types";

type MessageThread = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  updated_at: string;
};

type MessageRecord = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  attachment_path: string | null;
  created_at: string;
  attachment_url?: string | null;
};

type Person = Pick<Profile, "id" | "display_name" | "avatar_url">;

function messageError(error: unknown, fallback: string) {
  if (
    error instanceof TypeError ||
    (error instanceof Error && /failed to fetch|network request failed/i.test(error.message))
  ) {
    return "Could not reach Fieldnotes. Check your connection and try again.";
  }
  return error instanceof Error ? error.message : fallback;
}

export function MessagesInbox() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [writers, setWriters] = useState<Person[]>([]);
  const [latestMessages, setLatestMessages] = useState<Record<string, MessageRecord>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [newRecipient, setNewRecipient] = useState<Person | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [responding, setResponding] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const targetIdRef = useRef("");

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) || null;
  const activeThreads = useMemo(
    () => threads.filter((thread) => thread.status !== "declined"),
    [threads],
  );
  const otherPersonId = selectedThread
    ? selectedThread.requester_id === user?.id
      ? selectedThread.recipient_id
      : selectedThread.requester_id
    : null;
  const recipient = newRecipient || (otherPersonId ? people[otherPersonId] : null);
  const incomingRequest = Boolean(
    selectedThread &&
      selectedThread.status === "pending" &&
      selectedThread.recipient_id === user?.id,
  );
  const canSend = Boolean(
    newRecipient ||
      (selectedThread && selectedThread.status === "accepted"),
  );

  useEffect(() => {
    if (!attachmentPreview) return;
    return () => URL.revokeObjectURL(attachmentPreview);
  }, [attachmentPreview]);

  useEffect(() => {
    let active = true;
    let selectedId = "";
    const supabase = createClient();

    async function refreshInbox() {
      try {
        const targetId = targetIdRef.current;
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const currentUser = sessionData.session?.user;
        if (!currentUser) {
          router.replace("/sign-in?next=%2Fmessages");
          return;
        }
        if (!active) return;
        setUser(currentUser);

        const { data: threadRows, error: threadError } = await supabase
          .from("message_threads")
          .select("id, requester_id, recipient_id, status, created_at, updated_at")
          .or(`requester_id.eq.${currentUser.id},recipient_id.eq.${currentUser.id}`)
          .order("updated_at", { ascending: false });
        if (threadError) throw threadError;
        const loadedThreads = (threadRows || []) as MessageThread[];
        const ids = [
          ...new Set([
            ...loadedThreads.map((thread) =>
              thread.requester_id === currentUser.id
                ? thread.recipient_id
                : thread.requester_id,
            ),
            ...(targetId ? [targetId] : []),
          ]),
        ].filter((id) => id !== currentUser.id);
        const [profileResult, writerResult] = await Promise.all([
          ids.length
            ? supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .neq("id", currentUser.id)
            .order("display_name", { ascending: true })
            .limit(80),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (writerResult.error) throw writerResult.error;
        const profileMap = Object.fromEntries(
          ((profileResult.data || []) as Person[]).map((profile) => [profile.id, profile]),
        );
        const latestByThread: Record<string, MessageRecord> = {};
        if (loadedThreads.length) {
          const { data: recentRows, error: recentError } = await supabase
            .from("messages")
            .select("id, thread_id, sender_id, body, attachment_path, created_at")
            .in("thread_id", loadedThreads.map((thread) => thread.id))
            .order("created_at", { ascending: false });
          if (recentError) throw recentError;
          for (const row of (recentRows || []) as MessageRecord[]) {
            if (!latestByThread[row.thread_id]) latestByThread[row.thread_id] = row;
          }
        }

        if (!active) return;
        setError("");
        setThreads(loadedThreads);
        setPeople(profileMap);
        setWriters((writerResult.data || []) as Person[]);
        setLatestMessages(latestByThread);

        if (targetId) {
          const activeTargetThread = loadedThreads.find(
            (thread) =>
              thread.status !== "declined" &&
              (thread.requester_id === targetId || thread.recipient_id === targetId),
          );
          if (activeTargetThread) {
            setNewRecipient(null);
            if (!selectedId) {
              selectedId = activeTargetThread.id;
              setSelectedThreadId(selectedId);
            }
          } else {
            const target = profileMap[targetId];
            if (target && targetId !== currentUser.id) setNewRecipient(target);
          }
        } else if (!selectedId && loadedThreads.length) {
          const firstThread =
            loadedThreads.find(
              (thread) =>
                thread.status === "pending" && thread.recipient_id === currentUser.id,
            ) || loadedThreads.find((thread) => thread.status !== "declined");
          if (firstThread) {
            selectedId = firstThread.id;
            setSelectedThreadId(firstThread.id);
          }
        }

      } catch (loadError) {
        if (active) setError(messageError(loadError, "Your messages could not be loaded."));
      } finally {
        if (active) setLoading(false);
      }
    }

    const params = new URLSearchParams(window.location.search);
    targetIdRef.current = params.get("to") || "";
    void refreshInbox();
    const refreshTimer = window.setInterval(() => void refreshInbox(), 5000);
    return () => {
      active = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, [router]);

  useEffect(() => {
    if (!selectedThreadId) return;

    let active = true;
    const supabase = createClient();
    async function refreshMessages() {
      try {
        const { data: rows, error: readError } = await supabase
          .from("messages")
          .select("id, thread_id, sender_id, body, attachment_path, created_at")
          .eq("thread_id", selectedThreadId)
          .order("created_at", { ascending: true });
        if (readError) throw readError;
        const withUrls = await Promise.all(
          ((rows || []) as MessageRecord[]).map(async (message) => {
            if (!message.attachment_path) return message;
            const { data: signed, error: signedError } = await supabase.storage
              .from("message-images")
              .createSignedUrl(message.attachment_path, 3600);
            if (signedError) throw signedError;
            return { ...message, attachment_url: signed.signedUrl };
          }),
        );
        if (active) setMessages(withUrls);
      } catch (loadError) {
        if (active) setError(messageError(loadError, "This conversation could not be loaded."));
      }
    }

    void refreshMessages();
    const timer = window.setInterval(() => void refreshMessages(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedThreadId]);

  function chooseThread(thread: MessageThread) {
    targetIdRef.current = "";
    setSelectedThreadId(thread.id);
    setNewRecipient(null);
    setMessages([]);
    setError("");
  }

  function chooseWriter(person: Person) {
    targetIdRef.current = "";
    const existingThread = threads.find(
      (thread) =>
        thread.status !== "declined" &&
        (thread.requester_id === person.id || thread.recipient_id === person.id),
    );
    if (existingThread) {
      chooseThread(existingThread);
      return;
    }
    setSelectedThreadId(null);
    setNewRecipient(person);
    setMessages([]);
    setError("");
    setNotice("");
  }

  function chooseAttachment(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] || null;
    setNotice("");
    if (!file) {
      setAttachment(null);
      setAttachmentPreview("");
      return;
    }
    if (!IMAGE_MIME_TYPES.includes(file.type as (typeof IMAGE_MIME_TYPES)[number])) {
      setAttachment(null);
      setAttachmentPreview("");
      event.currentTarget.value = "";
      setNotice("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setAttachment(null);
      setAttachmentPreview("");
      event.currentTarget.value = "";
      setNotice("Message images must be 5 MB or smaller.");
      return;
    }
    setAttachment(file);
    setAttachmentPreview(URL.createObjectURL(file));
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !canSend || (!body.trim() && !attachment)) return;
    setSending(true);
    setError("");
    setNotice("");
    const supabase = createClient();
    let threadId = selectedThread?.id || "";
    let createdThread = false;
    let uploadedPath = "";
    const requestedPerson = newRecipient;

    try {
      if (!threadId && newRecipient) {
        const { data: created, error: createError } = await supabase
          .from("message_threads")
          .insert({
            requester_id: user.id,
            recipient_id: newRecipient.id,
            status: "pending",
          })
          .select("id")
          .single();
        if (createError) throw createError;
        threadId = created.id;
        createdThread = true;
      }

      if (attachment) {
        const extension = attachment.type === "image/jpeg" ? "jpg" : attachment.type.split("/")[1];
        uploadedPath = `${threadId}/${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("message-images")
          .upload(uploadedPath, attachment, {
            contentType: attachment.type,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
      }

      const { error: insertError } = await supabase.from("messages").insert({
        thread_id: threadId,
        sender_id: user.id,
        body: body.trim(),
        attachment_path: uploadedPath || null,
      });
      if (insertError) throw insertError;

      setBody("");
      setAttachment(null);
      setAttachmentPreview("");
      setNewRecipient(null);
      targetIdRef.current = "";
      setSelectedThreadId(threadId);
      setNotice(createdThread ? "Message request sent." : "Message sent.");
      if (createdThread && requestedPerson) {
        const now = new Date().toISOString();
        setThreads((current) => [
          {
            id: threadId,
            requester_id: user.id,
            recipient_id: requestedPerson.id,
            status: "pending",
            created_at: now,
            updated_at: now,
          },
          ...current,
        ]);
        setPeople((current) => ({ ...current, [requestedPerson.id]: requestedPerson }));
      }
      window.history.replaceState(null, "", "/messages");
    } catch (sendError) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from("message-images")
          .remove([uploadedPath]);
        if (cleanupError) console.error("Could not remove the failed message attachment.", cleanupError);
      }
      if (createdThread && threadId) {
        const { error: cleanupError } = await supabase
          .from("message_threads")
          .delete()
          .eq("id", threadId);
        if (cleanupError) console.error("Could not remove the empty message request.", cleanupError);
      }
      setError(messageError(sendError, "Your message could not be sent."));
    } finally {
      setSending(false);
    }
  }

  async function respondToRequest(accept: boolean) {
    if (!selectedThread) return;
    setResponding(true);
    setError("");
    try {
      const { error: responseError } = await createClient().rpc("respond_to_message_request", {
        p_thread_id: selectedThread.id,
        p_accept: accept,
      });
      if (responseError) throw responseError;
      setThreads((current) =>
        accept
          ? current.map((thread) =>
              thread.id === selectedThread.id ? { ...thread, status: "accepted" } : thread,
            )
          : current.filter((thread) => thread.id !== selectedThread.id),
      );
      if (!accept) {
        setSelectedThreadId(null);
        setMessages([]);
      }
      setNotice(accept ? "Message request accepted." : "Message request declined.");
    } catch (responseError) {
      setError(messageError(responseError, "The message request could not be updated."));
    } finally {
      setResponding(false);
    }
  }

  const selectedPerson = recipient;

  return (
    <div className="app-shell messages-app-shell">
      <SiteHeader />
      <main className="messages-page">
        <header className="messages-page-heading">
          <div>
            <p className="eyebrow">Private conversations</p>
            <h1>Messages</h1>
          </div>
          <Link className="messages-back-link" href="/dashboard">Back to your studio</Link>
        </header>

        {loading ? (
          <div className="messages-state" role="status">Opening your inbox…</div>
        ) : error && !threads.length && !newRecipient ? (
          <div className="messages-state messages-error" role="alert">
            <strong>Your inbox could not be opened.</strong>
            <span>{error}</span>
            <span>Run <code>supabase-messaging.sql</code> in the Supabase SQL editor, then try again.</span>
          </div>
        ) : (
          <div className="messages-layout">
            <aside className="messages-sidebar" aria-label="Conversations">
              <div className="messages-sidebar-heading">
                <h2>Inbox</h2>
                <span>{activeThreads.length}</span>
              </div>
              {activeThreads.length ? (
                <div className="messages-thread-list">
                  {activeThreads.map((thread) => {
                    const personId =
                      thread.requester_id === user?.id ? thread.recipient_id : thread.requester_id;
                    const person = people[personId];
                    const last = latestMessages[thread.id];
                    const pendingIncoming =
                      thread.status === "pending" && thread.recipient_id === user?.id;
                    return (
                      <button
                        key={thread.id}
                        className={`messages-thread-item${thread.id === selectedThreadId ? " is-active" : ""}`}
                        type="button"
                        onClick={() => chooseThread(thread)}
                      >
                        <span className="messages-avatar">
                          {person?.avatar_url ? (
                            <Image src={person.avatar_url} alt="" width={46} height={46} unoptimized />
                          ) : (
                            getInitials(person?.display_name || "Writer")
                          )}
                        </span>
                        <span className="messages-thread-copy">
                          <strong>{person?.display_name || "Fieldnotes writer"}</strong>
                          <small>
                            {pendingIncoming ? "Message request" : last?.body || (last?.attachment_path ? "Image" : "No messages yet")}
                          </small>
                        </span>
                        {pendingIncoming ? <span className="messages-request-dot" aria-label="Request" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="messages-sidebar-empty">Your conversations will appear here.</p>
              )}
              <div className="messages-writers">
                <h3>Start with a writer</h3>
                {writers.length ? (
                  writers.slice(0, 20).map((person) => (
                    <button
                      className="messages-writer-choice"
                      key={person.id}
                      type="button"
                      onClick={() => chooseWriter(person)}
                    >
                      <span className="messages-avatar messages-avatar-small">
                        {person.avatar_url ? (
                          <Image src={person.avatar_url} alt="" width={34} height={34} unoptimized />
                        ) : (
                          getInitials(person.display_name || "Writer")
                        )}
                      </span>
                      <span>{person.display_name || "Fieldnotes writer"}</span>
                    </button>
                  ))
                ) : (
                  <p>No other writers are available yet.</p>
                )}
              </div>
            </aside>

            <section className="messages-conversation" aria-label="Message conversation">
              {selectedPerson ? (
                <>
                  <header className="messages-conversation-header">
                    <span className="messages-avatar">
                      {selectedPerson.avatar_url ? (
                        <Image src={selectedPerson.avatar_url} alt="" width={46} height={46} unoptimized />
                      ) : (
                        getInitials(selectedPerson.display_name || "Writer")
                      )}
                    </span>
                    <div>
                      <strong>{selectedPerson.display_name || "Fieldnotes writer"}</strong>
                      <small>
                        {selectedThread?.status === "accepted"
                          ? "Conversation"
                          : selectedThread?.status === "pending"
                            ? incomingRequest
                              ? "Message request"
                              : "Request sent"
                            : "New message request"}
                      </small>
                    </div>
                    <Link href={`/writers/${selectedPerson.id}`}>View profile</Link>
                  </header>

                  {incomingRequest ? (
                    <div className="messages-request-banner">
                      <p>This writer would like to start a conversation. Accept to reply.</p>
                      <div>
                        <button type="button" onClick={() => void respondToRequest(true)} disabled={responding}>
                          {responding ? "Please wait…" : "Accept request"}
                        </button>
                        <button type="button" onClick={() => void respondToRequest(false)} disabled={responding}>
                          Decline
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!selectedThread && newRecipient ? (
                    <div className="messages-request-intro">
                      <p>
                        Your first message will be sent as a request. {selectedPerson.display_name || "This writer"} can accept before either of you continue the conversation.
                      </p>
                    </div>
                  ) : null}

                  {selectedThread?.status === "pending" && !incomingRequest ? (
                    <div className="messages-pending-note" role="status">
                      Your request is waiting for a reply. You can send one introduction with an image.
                    </div>
                  ) : null}

                  <div className="messages-history" aria-live="polite">
                    {messages.length ? (
                      messages.map((message) => (
                        <article
                          className={`messages-bubble${message.sender_id === user?.id ? " is-mine" : ""}`}
                          key={message.id}
                        >
                          {message.body ? <p>{message.body}</p> : null}
                          {message.attachment_url ? (
                            <a href={message.attachment_url} target="_blank" rel="noreferrer">
                              <Image
                                src={message.attachment_url}
                                alt="Image attachment"
                                width={600}
                                height={600}
                                unoptimized
                              />
                            </a>
                          ) : null}
                          <time dateTime={message.created_at}>
                            {new Intl.DateTimeFormat("en", {
                              hour: "numeric",
                              minute: "2-digit",
                              day: "numeric",
                              month: "short",
                            }).format(new Date(message.created_at))}
                          </time>
                        </article>
                      ))
                    ) : (
                      <p className="messages-empty-conversation">
                        {incomingRequest
                          ? "Read the introduction before deciding whether to accept."
                          : "No messages yet. Start with a few words."}
                      </p>
                    )}
                  </div>

                  {canSend ? (
                    <form className="messages-compose" onSubmit={(event) => void sendMessage(event)}>
                      {attachmentPreview ? (
                        <div className="messages-attachment-preview">
                          <Image src={attachmentPreview} alt="Image attachment preview" width={90} height={90} unoptimized />
                          <button
                            type="button"
                            onClick={() => {
                              setAttachment(null);
                              setAttachmentPreview("");
                            }}
                          >
                            Remove image
                          </button>
                        </div>
                      ) : null}
                      <textarea
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        maxLength={5000}
                        placeholder="Write a message"
                        aria-label="Message"
                      />
                      <div className="messages-compose-actions">
                        <label className="messages-attach-button">
                          Add image
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={chooseAttachment}
                          />
                        </label>
                        <span>JPEG, PNG or WebP · up to 5 MB</span>
                        <button type="submit" disabled={sending || (!body.trim() && !attachment)}>
                          {sending ? "Sending…" : newRecipient ? "Send request" : "Send message"}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </>
              ) : (
                <div className="messages-welcome">
                  <p className="eyebrow">Fieldnotes inbox</p>
                  <h2>A note is a good way to begin.</h2>
                  <p>Choose a writer to send a private message request. They decide whether to open the conversation.</p>
                </div>
              )}
            </section>
          </div>
        )}
        {error ? <p className="messages-inline-error" role="alert">{error}</p> : null}
        {notice ? <p className="messages-notice" role="status">{notice}</p> : null}
      </main>
    </div>
  );
}
