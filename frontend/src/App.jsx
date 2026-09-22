import { useState } from "react";
import BookView from "./components/BookView.jsx";
import CreateForm from "./components/CreateForm.jsx";
import HealthDot from "./components/HealthDot.jsx";
import "./index.css";

export default function App() {
  const [bookId, setBookId] = useState(null);
  return (
    <div className="min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <header className="mx-auto mb-8 flex max-w-2xl flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-black tracking-tight">
            📖 Storybook Studio
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Illustrated books, drawn on your own GPU.
          </p>
        </div>
        <HealthDot />
      </header>
      <main>
        {bookId ? (
          <BookView bookId={bookId} onBack={() => setBookId(null)} />
        ) : (
          <CreateForm onCreated={setBookId} />
        )}
      </main>
      <footer className="mx-auto mt-12 max-w-2xl text-center text-xs text-stone-400">
        Runs on free Kaggle GPU — books vanish when the session sleeps, so export
        the ones you love.
      </footer>
    </div>
  );
}
