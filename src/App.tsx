import MyBadge from './Badge';
import EventResults from './pages/EventResults';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConnectionsPage } from './connections';
import Home from './pages/Home';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminSession from './pages/admin/AdminSession';
import ParticipantDashboard from './pages/participant/ParticipantDashboard';
import DisplayMode from './pages/display/DisplayMode';
import { MemberGate, Account, Members, MemberProfile } from './identity';

export default function App() {
  return <BrowserRouter><MemberGate><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/connections" element={<ConnectionsPage />} />
    <Route path="/badge" element={<MyBadge />} />
    <Route path="/results/:sessionId" element={<EventResults />} />
    <Route path="/account" element={<Account />} />
    <Route path="/members" element={<Members />} />
    <Route path="/members/:memberId" element={<MemberProfile />} />
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/admin/:sessionId" element={<AdminSession />} />
    <Route path="/session/:sessionId" element={<ParticipantDashboard />} />
    <Route path="/display/:sessionId" element={<DisplayMode />} />
    <Route path="*" element={<Home />} />
  </Routes></MemberGate></BrowserRouter>;
}
