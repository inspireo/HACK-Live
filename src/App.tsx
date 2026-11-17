import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminSession from './pages/admin/AdminSession';
import ParticipantDashboard from './pages/participant/ParticipantDashboard';
import DisplayMode from './pages/display/DisplayMode';
import { MemberGate, Account, Members, MemberProfile } from './identity';
import PublicInvitation, { InvitationRegistration } from './pages/PublicInvitation';

export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/invite/:token" element={<PublicInvitation />} />
    <Route path="*" element={<MemberGate><Routes>
    <Route path="/invite/:token/register" element={<InvitationRegistration />} />
    <Route path="/" element={<Home />} />
    <Route path="/account" element={<Account />} />
    <Route path="/members" element={<Members />} />
    <Route path="/members/:memberId" element={<MemberProfile />} />
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/admin/:sessionId" element={<AdminSession />} />
    <Route path="/session/:sessionId" element={<ParticipantDashboard />} />
    <Route path="/display/:sessionId" element={<DisplayMode />} />
    <Route path="*" element={<Home />} />
  </Routes></MemberGate>} />
  </Routes></BrowserRouter>;
}
