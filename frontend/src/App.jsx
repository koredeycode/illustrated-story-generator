import { useState } from "react";
import BookView from "./components/BookView.jsx";
import CreateForm from "./components/CreateForm.jsx";
import Gallery from "./components/Gallery.jsx";
import HealthDot from "./components/HealthDot.jsx";
import Icon from "./components/icons.jsx";
import ReaderView from "./components/ReaderView.jsx";
import "./index.css";

export default function App() {
  const [bookId, setBookId] = useState(null);
  const [view, setView] = useState("create");

  const openBook = (id) => {
    setBookId(id);
    setView("book");
  };

  const tab = (active) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-stone-900 text-white"
        : "text-stone-600 hover:bg-stone-200/60 hover:text-ink"
    }`;

  return (
    <div className="min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <header className="mx-auto mb-6 flex max-w-2xl flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-4xl font-black tracking-tight">
            <Icon name="book" className="h-8 w-8 text-amber-700" />
            Storybook Studio
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Illustrated books, drawn on your own GPU.
          </p>
        </div>
        <HealthDot />
      </header>
      {view !== "reader" && (
        <nav aria-label="Sections" className="mx-auto mb-8 flex max-w-2xl gap-2">
          <button
            className={tab(view === "create" && !bookId)}
            onClick={() => {
              setBookId(null);
              setView("create");
            }}
          >
            New story
          </button>
          <button
            className={tab(view === "library")}
            onClick={() => {
              setBookId(null);
              setView("library");
            }}
          >
            Library
          </button>
        </nav>
      )}
      <main>
        {view === "reader" && bookId ? (
          <ReaderView bookId={bookId} onBack={() => setView("book")} />
        ) : view === "book" && bookId ? (
          <BookView bookId={bookId} onBack={() => setView("library")} onRead={openBook} />
        ) : view === "library" ? (
          <Gallery onOpen={openBook} />
        ) : (
          <CreateForm onCreated={openBook} />
        )}
      </main>
      <footer className="mx-auto mt-12 max-w-2xl text-center text-xs text-stone-400">
        Runs on free Kaggle GPU — finished books back up to cloud storage when
        configured, so export the ones you love.
      </footer>
    </div>
  );
}
