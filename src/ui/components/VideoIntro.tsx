import { useRef, useState } from 'react';
import { useL } from '../i18n';

const SRC = 'video/the-buzz-and-the-filter.mp4';
const POSTER = 'video/the-buzz-and-the-filter.jpg';
const PAPER = 'https://github.com/MithrilMan/teacher-in-the-loop';

/**
 * The video "The Buzz and the Filter" on the welcome step: a thumbnail that
 * opens a player. Nothing plays by itself, and closing the player stops it.
 */
export function VideoIntro() {
  const L = useL();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const show = () => { setOpen(true); dialog.current?.showModal(); };
  const hide = () => dialog.current?.close();
  return (
    <>
      <button className="video-intro" onClick={show}>
        <img src={POSTER} alt="" width={128} height={72} />
        <span className="video-intro-text">
          <b><span aria-hidden>▶</span> {L({ it: 'Guarda il video', en: 'Watch the video' })}</b>
          <span>{L({ it: 'The Buzz and the Filter: come nasce una voce, 7 minuti, in inglese con sottotitoli', en: 'The Buzz and the Filter: how a voice is made, 7 minutes, with captions' })}</span>
        </span>
      </button>
      <dialog ref={dialog} className="video-dialog" aria-label="The Buzz and the Filter"
        onClose={() => setOpen(false)} onClick={(e) => { if (e.target === dialog.current) hide(); }}>
        <div className="video-frame">
          {open && <video src={SRC} poster={POSTER} controls preload="metadata" playsInline />}
          <div className="video-foot">
            <span>
              {L({ it: 'Narrato dal piccolo modello vocale del paper ', en: 'Narrated by the small speech model of the paper ' })}
              <a href={PAPER} target="_blank" rel="noreferrer">Teacher in the Loop</a>.
            </span>
            <button className="btn" onClick={hide}>{L({ it: 'Chiudi', en: 'Close' })}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
