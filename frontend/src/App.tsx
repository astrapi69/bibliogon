import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import BookEditor from "./pages/BookEditor";
import {useTheme} from "./hooks/useTheme";

export default function App() {
    // Initialize theme on app start (applies data-theme attribute)
    useTheme();

    return (
        <Routes>
            <Route path="/" element={<Dashboard/>}/>
            <Route path="/book/:bookId" element={<BookEditor/>}/>
        </Routes>
    );
}
