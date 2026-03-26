import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import BookEditor from "./pages/BookEditor";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import GetStarted from "./pages/GetStarted";
import {useTheme} from "./hooks/useTheme";

export default function App() {
    // Initialize theme on app start (applies data-theme attribute)
    useTheme();

    return (
        <Routes>
            <Route path="/" element={<Dashboard/>}/>
            <Route path="/book/:bookId" element={<BookEditor/>}/>
            <Route path="/settings" element={<Settings/>}/>
            <Route path="/help" element={<Help/>}/>
            <Route path="/get-started" element={<GetStarted/>}/>
        </Routes>
    );
}
