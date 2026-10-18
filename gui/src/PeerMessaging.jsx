import React from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCheck,
  Copy,
  Loader2,
  LockKeyhole,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
export default function PeerMessaging({
  session,
  sender,
  receiver,
  drafts,
  setDraft,
  send,
  sending,
  messages,
  decrypt,
  copy,
}) {
  const peers = [
    session?.sender || sender || "User A",
    session?.receiver || receiver || "User B",
  ];
  return (
    <div className="message-panes bidirectional">
      {peers.map((peer, i) => (
        <React.Fragment key={i}>
          {i === 1 && (
            <div className="message-channel">
              <LockKeyhole size={15} />
              <span>ONE SHARED KEY</span>
              <ArrowLeftRight size={19} />
              <span>AES-GCM</span>
            </div>
          )}
          <div
            className={`peer-pane ${i === 0 ? "sender-pane" : "receiver-pane"}`}
          >
            <div className="peer-heading">
              <span className={`peer-avatar ${i ? "green-avatar" : ""}`}>
                <UserRound size={15} />
              </span>
              <strong>{peer}</strong>
              <span>SEND & RECEIVE</span>
            </div>
            <textarea
              aria-label={`Message from ${peer}`}
              placeholder={`Write to ${peers[1 - i]}…`}
              value={drafts[i]}
              maxLength={16000}
              disabled={!session || !!sending}
              onChange={(e) => setDraft(i, e.target.value)}
            />
            <div className="compose-footer">
              <small>
                {new TextEncoder().encode(drafts[i]).length} / 16,000 bytes
              </small>
              <button
                className="button primary small"
                aria-label={`Encrypt & send from ${peer}`}
                disabled={
                  !session ||
                  !!sending ||
                  !drafts[i].trim() ||
                  new TextEncoder().encode(drafts[i]).length > 16000
                }
                onClick={() => send(i)}
              >
                {sending === peer ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <Send size={13} />
                )}
                Encrypt & send
              </button>
            </div>
            <div className="peer-inbox-label">INBOX · FROM {peers[1 - i]}</div>
            {messages.some((m) => m.receiver === peer) ? (
              <div className="received-messages">
                {messages
                  .filter((m) => m.receiver === peer)
                  .map((m) => (
                    <article className="received-item" key={m.id}>
                      <div className="message-direction">
                        {m.sender}
                        <ArrowRight size={10} />
                        {m.receiver}
                      </div>
                      {m.plaintext !== null ? (
                        <>
                          <span className="verified">
                            <CheckCheck size={12} />
                            Authenticated & decrypted
                          </span>
                          <p>{m.plaintext}</p>
                        </>
                      ) : (
                        <>
                          <span className="cipher-label">
                            ENCRYPTED PAYLOAD
                            <button
                              aria-label={`Copy ciphertext for ${peer}`}
                              onClick={() => copy(m.ciphertext)}
                            >
                              <Copy size={12} />
                            </button>
                          </span>
                          <code>{m.ciphertext}</code>
                          <button
                            className="text-button"
                            aria-label={`Verify & decrypt for ${peer}`}
                            onClick={() => decrypt(m)}
                          >
                            <LockKeyhole size={12} />
                            Verify & decrypt
                            <ArrowRight size={12} />
                          </button>
                        </>
                      )}
                    </article>
                  ))}
              </div>
            ) : (
              <div className="message-empty">
                <ShieldCheck size={22} strokeWidth={1.3} />
                <span>
                  {session
                    ? `Waiting for a message from ${peers[1 - i]}`
                    : "Establish one shared session to chat both ways"}
                </span>
              </div>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
