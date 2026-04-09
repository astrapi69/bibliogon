import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import BookEditor from "./pages/BookEditor";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import GetStarted from "./pages/GetStarted";
import {useTheme} from "./hooks/useTheme";
import {I18nProvider} from "./hooks/useI18n";
import {DialogProvider} from "./components/AppDialog";
import AudioExportGate from "./components/AudioExportGate";
import {AudiobookJobProvider} from "./contexts/AudiobookJobContext";
import {ToastContainer} from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
    // Initialize theme on app start (applies data-theme attribute)
    useTheme();

    return (
        <I18nProvider>
        <DialogProvider>
        <AudiobookJobProvider>
            <Routes>
                <Route path="/" element={<Dashboard/>}/>
                <Route path="/book/:bookId" element={<BookEditor/>}/>
                <Route path="/settings" element={<Settings/>}/>
                <Route path="/help" element={<Help/>}/>
                <Route path="/get-started" element={<GetStarted/>}/>
            </Routes>
            {/* Renders the audiobook progress modal or its minimized badge,
                whichever the AudiobookJobContext currently exposes. */}
            <AudioExportGate/>
            <ToastContainer
                position="bottom-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop
                closeOnClick
                pauseOnHover
                theme="colored"
            />
        </AudiobookJobProvider>
        </DialogProvider>
        </I18nProvider>
    );
}
