import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import BookEditor from "./pages/BookEditor";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/book/:bookId" element={<BookEditor />} />
    </Routes>
  );
}
