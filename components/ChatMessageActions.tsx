"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  isMine: boolean;
  isPinned: boolean;
  onReply: () => void;
  onPin: () => void;
  onForward: () => void;
  onThread: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  canModerate?: boolean;
};

export default function ChatMessageActions({
  isMine,
  isPinned,
  onReply,
  onPin,
  onForward,
  onThread,
  onEdit,
  onDelete,
  canModerate = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, []);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div
      ref={menuRef}
      className="relative"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="
          h-7 w-7
          flex items-center justify-center
          rounded-full
          text-gray-400
          hover:text-gray-700
          hover:bg-gray-100
          transition
        "
        title="Message options"
        aria-label="Message options"
        aria-expanded={open}
      >
        ⋮
      </button>

      {open && (
        <div
          className={`
            absolute z-50 bottom-full mb-1
            w-44 overflow-hidden
            rounded-xl border border-gray-200
            bg-white shadow-lg
            py-1
            ${isMine ? "right-0" : "left-0"}
          `}
        >
          <button
            type="button"
            onClick={() => run(onReply)}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <span className="w-5 text-center">↩</span>
            <span>Reply</span>
          </button>

          <button
            type="button"
            onClick={() => run(onForward)}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <span className="w-5 text-center">↗</span>
            <span>Forward</span>
          </button>

          <button
            type="button"
            onClick={() => run(onPin)}
            className={`
              w-full px-3 py-2 text-left text-sm
              hover:bg-gray-50 flex items-center gap-2
              ${isPinned ? "text-amber-700" : "text-gray-700"}
            `}
          >
            <span className="w-5 text-center">📌</span>
            <span>{isPinned ? "Unpin" : "Pin"}</span>
          </button>

          <button
            type="button"
            onClick={() => run(onThread)}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <span className="w-5 text-center">🧵</span>
            <span>Thread</span>
          </button>

          {isMine && onEdit && (
            <button
              type="button"
              onClick={() => run(onEdit)}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <span className="w-5 text-center">✏️</span>
              <span>Edit</span>
            </button>
          )}

          {(isMine || canModerate) && onDelete && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={() => run(onDelete)}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <span className="w-5 text-center">🗑️</span>
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
