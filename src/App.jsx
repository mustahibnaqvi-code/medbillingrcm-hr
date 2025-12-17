import React, { useState, useEffect, useRef } from 'react';
import { 
  initializeApp 
} from 'firebase/app'; 
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously, 
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth'; 
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  query, 
  orderBy, 
  where,
  serverTimestamp,
  getDocs,
  deleteDoc
} from 'firebase/firestore';
import { 
  Users, 
  Calendar, 
  DollarSign, 
  Briefcase, 
  MapPin, 
  LogOut, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  FileText, 
  TrendingUp, 
  Shield, 
  Menu,
  X,
  UserPlus,
  Settings,
  Activity,
  ChevronRight,
  CreditCard,
  ToggleLeft,
  ToggleRight,
  Globe,
  User,
  Building,
  Edit3,
  Lock,
  ShoppingBag,
  Trash2,
  Plus,
  ArrowUpCircle,
  Printer,
  PiggyBank,
  Bell,
  Target,
  Megaphone,
  BarChart2,
  Baby
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line
} from 'recharts';

// --- Configuration & Constants ---

const ROLE_HIERARCHY = {
  'Employee': 1,
  'Team Lead': 2,
  'Supervisor': 3,
  'Manager': 4,
  'HR Executive': 5,
  'Finance Executive': 5,
  'Senior HR': 6,
  'Finance Manager': 6,
  'Director': 7,
  'President': 8,
  'CEO': 9
};

const DEFAULT_SHIFTS = {
  'Morning': { start: '09:00', end: '18:00' },
  'Evening': { start: '18:00', end: '03:00' }
};

const DEFAULT_DEPARTMENTS = ['AR', 'Billing', 'Verification', 'Credentialing', 'IT', 'HR', 'Finance'];

const DEFAULT_LEAVE_QUOTAS = {
  'Casual': 10,
  'Medical': 10,
  'Emergency': 5,
  'Maternity': 90, // Fixed policy
  'Paternity': 10  // Fixed policy
};

const DEFAULT_OFFICE_LOCATION = { lat: 31.4504, lng: 73.1350, radius: 100 }; // meters

const HOLIDAYS = [
  { name: "New Year's Day (US)", date: "2026-01-01", type: "US Federal" },
  { name: "Eid ul-Fitr", date: "2025-03-31", type: "PK (Moon Subject)" },
  { name: "Eid ul-Adha", date: "2025-06-07", type: "PK (Moon Subject)" },
  { name: "Independence Day (US)", date: "2025-07-04", type: "US Federal" },
  { name: "Ashura (9-10 Muharram)", date: "2025-07-06", type: "PK (Moon Subject)" },
  { name: "Labor Day (US)", date: "2025-09-01", type: "US Federal" },
  { name: "Thanksgiving (US)", date: "2025-11-27", type: "US Federal" },
  { name: "Christmas (US)", date: "2025-12-25", type: "US Federal" }
].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

// --- Firebase Initialization ---

const firebaseConfig = {
  apiKey: "AIzaSyDk-pzjSC5ZGF9zcEF7pgZLl4mhxhgw9aY",
  authDomain: "my-mbrcm.firebaseapp.com",
  projectId: "my-mbrcm",
  storageBucket: "my-mbrcm.firebasestorage.app",
  messagingSenderId: "1052302450234",
  appId: "1:1052302450234:web:00464fec95736eba455f03"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'my-mbrcm-prod';

// --- Utility Functions ---

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const getDaysDifference = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive
  return diffDays > 0 ? diffDays : 0;
};

// --- Notification Helper ---
const sendNotification = async (userId, title, message, db) => {
  if (!userId) return;
  await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'notifications'), {
    title,
    message,
    read: false,
    date: new Date().toISOString()
  });
};

const findNextApprovalStage = async (currentStage, userDept, db) => {
  let nextStage = currentStage + 1;
  const maxStage = 9; 

  while (nextStage <= maxStage) {
    const rolesAtStage = Object.keys(ROLE_HIERARCHY).filter(r => ROLE_HIERARCHY[r] === nextStage);
    
    if (rolesAtStage.length === 0) {
      nextStage++;
      continue;
    }

    let q;
    const isOperationalRole = nextStage <= 4; 

    if (isOperationalRole) {
       q = query(collection(db, 'artifacts', appId, 'users'), 
                 where('role', 'in', rolesAtStage), 
                 where('department', '==', userDept));
    } else {
       q = query(collection(db, 'artifacts', appId, 'users'), 
                 where('role', 'in', rolesAtStage));
    }

    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      return nextStage;
    }
    nextStage++;
  }

  return maxStage; 
};

// --- Financial Logic Helpers ---

const calculatePKTax = (monthlyBaseSalary) => {
  const annualIncome = monthlyBaseSalary * 12;
  let annualTax = 0;

  if (annualIncome <= 600000) {
    annualTax = 0;
  } else if (annualIncome <= 1200000) {
    annualTax = (annualIncome - 600000) * 0.05;
  } else if (annualIncome <= 2200000) {
    annualTax = 30000 + ((annualIncome - 1200000) * 0.15);
  } else if (annualIncome <= 3200000) {
    annualTax = 180000 + ((annualIncome - 2200000) * 0.25);
  } else if (annualIncome <= 4100000) {
    annualTax = 430000 + ((annualIncome - 3200000) * 0.30);
  } else {
    annualTax = 700000 + ((annualIncome - 4100000) * 0.35);
  }
  return Math.round(annualTax / 12);
};

const calculatePF = (baseSalary, joiningDate, pfStatus) => {
    if (pfStatus !== 'Active') return 0;
    const join = new Date(joiningDate);
    const now = new Date();
    const diffDays = Math.ceil(Math.abs(now - join) / (1000 * 60 * 60 * 24));
    if (diffDays < 365) return 0; 
    return Math.round(baseSalary / 24);
};

// --- Components ---

const AuthScreen = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('Male');
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.toLowerCase().endsWith('@medbillingrcm.com')) {
      setError('Access denied. Only @medbillingrcm.com email addresses are allowed.');
      return;
    }

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid), {
          uid: user.uid,
          firstName,
          lastName,
          email,
          gender,
          dob,
          role: 'Employee',
          designation: 'Probationer',
          department: 'Unassigned',
          shift: 'Morning',
          baseSalary: 30000,
          joiningDate: new Date().toISOString(),
          status: 'Active',
          hasEditedProfile: false, 
          pfStatus: 'Inactive', 
          phone: '',
          address: '',
          dailyClaimTarget: 0, 
          revenueTarget: 0,
          assignedClients: ''
        });
        
        await updateProfile(user, { displayName: `${firstName} ${lastName}` });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message || "An error occurred during authentication.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur-sm p-8 rounded-2xl shadow-2xl w-full max-w-md border border-white/20">
        <div className="flex justify-center mb-6">
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-4 rounded-xl shadow-lg shadow-blue-500/30">
            <Activity className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="text-3xl font-bold text-center text-slate-800 mb-1">MyMBRCM Portal</h2>
        <p className="text-center text-slate-500 mb-8 text-sm uppercase tracking-wider font-semibold">{isRegistering ? 'Employee Registration' : 'Secure Access'}</p>
        
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded mb-6 text-sm flex items-start">
            <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          {isRegistering && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 ml-1">First Name</label>
                  <input required className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" value={firstName} onChange={e => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 ml-1">Last Name</label>
                  <input required className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" value={lastName} onChange={e => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 ml-1">Gender</label>
                  <select className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={gender} onChange={e => setGender(e.target.value)}>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 ml-1">Birth Date</label>
                  <input required type="date" className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={dob} onChange={e => setDob(e.target.value)} />
                </div>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 ml-1">Email (@medbillingrcm.com)</label>
            <input required type="email" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-500 ml-1">Password</label>
            <input required type="password" className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          
          <button type="submit" className="w-full bg-gradient-to-r from-blue-700 to-blue-600 text-white py-3 rounded-lg font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:to-blue-500 transition-all transform active:scale-[0.98]">
            {isRegistering ? 'Create Account' : 'Sign In'}
          </button>
        </form>
        
        <div className="mt-6 text-center text-sm text-slate-600">
          {isRegistering ? "Already have an account?" : "New to the team?"} 
          <button onClick={() => setIsRegistering(!isRegistering)} className="text-blue-600 font-bold ml-2 hover:text-blue-700 hover:underline">
            {isRegistering ? 'Login' : 'Register Here'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Notifications Component ---
const NotificationBell = ({ userId, db }) => {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'artifacts', appId, 'users', userId, 'notifications'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });
    return () => unsub();
  }, [userId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = async (n) => {
    await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'notifications', n.id), { read: true });
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-full">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
            {unreadCount}
          </span>
        )}
      </button>
      
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in zoom-in-95">
          <div className="p-4 border-b border-slate-100 font-bold text-sm text-slate-700 bg-slate-50">Notifications</div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">No notifications</p>
            ) : (
              notifications.map(n => (
                <div key={n.id} onClick={() => markRead(n)} className={`p-4 border-b border-slate-50 hover:bg-blue-50 cursor-pointer ${!n.read ? 'bg-blue-50/50' : ''}`}>
                  <p className={`text-sm ${!n.read ? 'font-bold text-slate-800' : 'text-slate-600'}`}>{n.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{n.message}</p>
                  <p className="text-[10px] text-slate-400 mt-2 text-right">{new Date(n.date).toLocaleTimeString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Layout = ({ user, userProfile, children, onLogout, activeTab, setActiveTab }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { name: 'Dashboard', icon: TrendingUp, roles: ['All'] },
    { name: 'My Profile', icon: User, roles: ['All'] },
    { name: 'Attendance', icon: Clock, roles: ['All'] },
    { name: 'Leaves', icon: Calendar, roles: ['All'] },
    { name: 'Dept Requests', icon: ShoppingBag, roles: ['All'] },
    { name: 'My Payslips', icon: CreditCard, roles: ['All'] },
    { name: 'Approvals', icon: CheckCircle, roles: ['Team Lead', 'Supervisor', 'Manager', 'HR Executive', 'Senior HR', 'Finance Executive', 'Finance Manager', 'Director', 'President', 'CEO'] },
    { name: 'Staff Directory', icon: Users, roles: ['Team Lead', 'Supervisor', 'Manager', 'HR Executive', 'Senior HR', 'Director', 'President', 'CEO'] },
    { name: 'Payroll Run', icon: Briefcase, roles: ['Finance Executive', 'Finance Manager', 'Director', 'President', 'CEO'] },
    { name: 'System Admin', icon: Settings, roles: ['HR Executive', 'Senior HR', 'CEO', 'President', 'Director'] },
  ];

  const hasAccess = (allowedRoles) => {
    if (allowedRoles.includes('All')) return true;
    return allowedRoles.includes(userProfile?.role);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0f172a] text-slate-300 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out flex flex-col shadow-2xl`}>
        <div className="h-20 flex items-center px-6 bg-[#0f172a] border-b border-slate-800">
          <div className="flex items-center space-x-3">
             <div className="bg-blue-600 p-2 rounded-lg">
                <Activity className="text-white w-5 h-5" />
             </div>
             <div>
                <h1 className="text-lg font-bold text-white tracking-tight">MyMBRCM</h1>
                <p className="text-[10px] uppercase text-blue-400 font-semibold tracking-wider">HR Portal v4.0</p>
             </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden ml-auto text-slate-400">
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-2">Main Menu</p>
          {menuItems.map((item) => (
             hasAccess(item.roles) && (
              <button
                key={item.name}
                onClick={() => { setActiveTab(item.name); setIsMobileMenuOpen(false); }}
                className={`group flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeTab === item.name 
                    ? 'bg-blue-600/10 text-blue-400' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center">
                  <item.icon size={18} className={`mr-3 ${activeTab === item.name ? 'text-blue-400' : 'text-slate-500 group-hover:text-white'}`} />
                  {item.name}
                </div>
                {activeTab === item.name && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]" />}
              </button>
             )
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-[#0b1120]">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md mr-3 border-2 border-slate-700">
              {userProfile?.firstName?.[0]}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-white truncate">{userProfile?.firstName} {userProfile?.lastName}</p>
              <p className="text-xs text-slate-400 truncate">{userProfile?.designation}</p>
            </div>
          </div>
          <button onClick={onLogout} className="flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 py-2 rounded-lg text-sm w-full transition-colors">
            <LogOut size={16} className="mr-2" /> Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 md:ml-64 flex flex-col h-full overflow-hidden bg-slate-50">
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-slate-200 h-16 flex items-center justify-between px-8">
          <div className="flex items-center">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden text-slate-600 mr-4">
              <Menu size={24} />
            </button>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">{activeTab}</h2>
          </div>
          <div className="flex items-center space-x-6">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Shift</span>
              <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{userProfile?.shift || 'Morning'}</span>
            </div>
            {/* Added Bell */}
            <NotificationBell userId={user.uid} db={db} />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto animate-in fade-in duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

// --- Module Components ---

const Dashboard = ({ userProfile, db }) => {
  const [stats, setStats] = useState({ present: 0, lates: 0, claims: 0 });
  const [attendanceData, setAttendanceData] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [teamStats, setTeamStats] = useState(null); // For TL
  const [revenueStats, setRevenueStats] = useState(null); // For Supervisor/Manager

  useEffect(() => {
    if (!userProfile) return;
    
    // 1. Personal Stats
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'attendance'), where('userId', '==', userProfile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let lates = 0;
      let claims = 0;
      const data = [];
      snapshot.docs.forEach(doc => {
        const d = doc.data();
        if (d.status === 'Late') lates++;
        if (d.claimsProcessed) claims += parseInt(d.claimsProcessed);
        data.push({ name: new Date(d.date).toLocaleDateString('en-US', {weekday: 'short'}), claims: d.claimsProcessed || 0 });
      });
      setStats({ present: snapshot.size, lates, claims });
      setAttendanceData(data.slice(-7)); 
    });

    // 2. Announcements
    const qNews = query(collection(db, 'artifacts', appId, 'public', 'data', 'announcements'), orderBy('date', 'desc'));
    const unsubNews = onSnapshot(qNews, (snap) => setAnnouncements(snap.docs.map(d => d.data())));

    // 3. KPI Logic
    const loadKPIs = async () => {
        if (userProfile.role === 'Team Lead') {
            // Fetch suboridnates
            const subQ = query(collection(db, 'artifacts', appId, 'users'), where('department', '==', userProfile.department), where('role', '==', 'Employee'));
            const subSnap = await getDocs(subQ);
            const subs = subSnap.docs.map(d => d.data());
            
            // Calc Targets
            const totalTarget = subs.reduce((acc, curr) => acc + (curr.dailyClaimTarget || 0), 0);
            
            // Calc Actual (Rough estimate for demo - fetches all attendance)
            // In prod, better to fetch attendance by dept + date
            const attQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'attendance'));
            const attSnap = await getDocs(attQ);
            let totalActual = 0;
            attSnap.docs.forEach(d => {
                const ad = d.data();
                if (subs.find(s => s.uid === ad.userId) && ad.date === new Date().toISOString().split('T')[0]) {
                    totalActual += (ad.claimsProcessed || 0);
                }
            });
            setTeamStats({ totalTarget, totalActual });
        }

        if (userProfile.role === 'Supervisor' || userProfile.role === 'Manager') {
            // Revenue Logic
            setRevenueStats({
                target: userProfile.revenueTarget || 0,
                current: userProfile.currentRevenue || 0
            });
        }
    };
    loadKPIs();

    return () => { unsubscribe(); unsubNews(); };
  }, [userProfile]);

  const updateRevenue = async (val) => {
      const newRev = parseInt(val) || 0;
      await updateDoc(doc(db, 'artifacts', appId, 'users', userProfile.uid), { currentRevenue: newRev });
      setRevenueStats(prev => ({...prev, current: newRev}));
  };

  const StatCard = ({ title, value, subtext, icon: Icon, colorClass, bgClass }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow duration-200 relative overflow-hidden">
      <div className="relative z-10 flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-slate-800">{value}</h3>
          {subtext && <p className={`text-xs font-semibold mt-2 ${colorClass}`}>{subtext}</p>}
        </div>
        <div className={`p-3 rounded-xl ${bgClass}`}>
          <Icon className={`w-6 h-6 ${colorClass}`} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* KPI Section - Conditional */}
      {teamStats && (
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="relative z-10 flex justify-between items-center">
                  <div>
                      <h3 className="text-lg font-bold flex items-center mb-1"><Target className="mr-2 text-blue-400"/> Team Performance (Today)</h3>
                      <p className="text-slate-400 text-sm">Combined claims output of {userProfile.department} team</p>
                  </div>
                  <div className="text-right">
                      <p className="text-4xl font-bold text-blue-400">{teamStats.totalActual} <span className="text-lg text-slate-500">/ {teamStats.totalTarget}</span></p>
                      <p className={`text-xs font-bold uppercase ${teamStats.totalActual < teamStats.totalTarget ? 'text-red-400' : 'text-emerald-400'}`}>
                          {teamStats.totalActual < teamStats.totalTarget ? 'Below Target' : 'On Track'}
                      </p>
                  </div>
              </div>
          </div>
      )}

      {revenueStats && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 flex items-center mb-4"><TrendingUp className="mr-2 text-emerald-600"/> Revenue KPI</h3>
              <div className="flex items-end justify-between mb-2">
                  <div>
                      <p className="text-xs font-bold text-slate-400 uppercase">Assigned Target</p>
                      <p className="text-2xl font-bold text-slate-800">${revenueStats.target.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                      <p className="text-xs font-bold text-slate-400 uppercase">Current Revenue</p>
                      <div className="flex items-center">
                          <span className="text-lg text-slate-500 mr-2">$</span>
                          <input type="number" value={revenueStats.current} onChange={(e) => updateRevenue(e.target.value)} className="border-b border-slate-300 focus:border-blue-500 outline-none w-32 text-2xl font-bold text-emerald-600 text-right"/>
                      </div>
                  </div>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 mt-2">
                  <div className="bg-emerald-500 h-2.5 rounded-full" style={{ width: `${Math.min((revenueStats.current / revenueStats.target) * 100, 100)}%` }}></div>
              </div>
          </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Attendance" value={`${stats.present} Days`} icon={Calendar} colorClass="text-blue-600" bgClass="bg-blue-50" />
        <StatCard title="Late Arrivals" value={stats.lates} subtext={stats.lates % 3 === 0 && stats.lates > 0 ? 'Penalty Applied' : `${3 - (stats.lates % 3)} lates to penalty`} icon={Clock} colorClass="text-orange-600" bgClass="bg-orange-50" />
        <StatCard title="Claims Processed" value={stats.claims} subtext="Current Month Output" icon={FileText} colorClass="text-emerald-600" bgClass="bg-emerald-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-slate-800 text-lg">Performance Analytics</h3>
                </div>
                <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={attendanceData}>
                        <defs>
                        <linearGradient id="colorClaims" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                        </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                        <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Area type="monotone" dataKey="claims" stroke="#2563eb" strokeWidth={3} fillOpacity={1} fill="url(#colorClaims)" />
                    </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* HOLIDAYS SECTION */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center"><Globe className="w-5 h-5 mr-2 text-blue-500" /> Upcoming Holidays</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {HOLIDAYS.filter(h => new Date(h.date) > new Date()).slice(0, 4).map((h, i) => (
                        <div key={i} className="flex items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="bg-blue-100 text-blue-700 font-bold p-2 rounded-lg text-center min-w-[50px] mr-3">
                                <span className="block text-xs uppercase">{new Date(h.date).toLocaleString('default', {month:'short'})}</span>
                                <span className="block text-lg leading-none">{new Date(h.date).getDate()}</span>
                            </div>
                            <div>
                                <p className="font-semibold text-slate-800 text-sm">{h.name}</p>
                                <p className="text-xs text-slate-500">{h.type}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* NEWSFEED SECTION */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col max-h-[600px]">
          <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center"><Megaphone className="w-5 h-5 mr-2 text-blue-500"/> Company News</h3>
          <div className="flex-1 space-y-4 overflow-y-auto pr-2">
             {announcements.length === 0 && <p className="text-slate-400 text-sm">No announcements yet.</p>}
             {announcements.map((news, idx) => (
                 <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase">{new Date(news.date).toLocaleDateString()}</span>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm mb-1">{news.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">{news.content}</p>
                 </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const UserProfile = ({ userProfile, db }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({...userProfile});
    const [pendingRequest, setPendingRequest] = useState(null);

    // Probation Logic
    const joiningDate = new Date(userProfile.joiningDate);
    const probationEndDate = new Date(joiningDate);
    probationEndDate.setDate(joiningDate.getDate() + 90);
    const today = new Date();
    const isProbation = today < probationEndDate;
    const daysRemaining = Math.ceil((probationEndDate - today) / (1000 * 60 * 60 * 24));

    useEffect(() => {
        const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), 
            where('userId', '==', userProfile.uid), 
            where('status', '==', 'Pending')
        );
        const unsub = onSnapshot(q, (snap) => {
            if(!snap.empty) setPendingRequest(snap.docs[0].data());
            else setPendingRequest(null);
        });
        return () => unsub();
    }, [userProfile.uid]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        if (!userProfile.hasEditedProfile) {
            await updateDoc(doc(db, 'artifacts', appId, 'users', userProfile.uid), {
                ...formData,
                hasEditedProfile: true
            });
            setIsEditing(false);
            alert("Profile updated successfully. Future updates will require approval.");
        } else {
            const financialChanged = formData.bankName !== userProfile.bankName || formData.accountNumber !== userProfile.accountNumber || formData.iban !== userProfile.iban;
            
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), {
                userId: userProfile.uid,
                userName: `${userProfile.firstName} ${userProfile.lastName}`,
                type: financialChanged ? 'bank_update' : 'profile_update', // Finance or HR
                data: formData,
                status: 'Pending',
                createdAt: new Date().toISOString()
            });
            setIsEditing(false);
            alert("Changes submitted for approval.");
        }
    };

    const pfAmount = calculatePF(formData.baseSalary || 0, formData.joiningDate, formData.pfStatus || 'Inactive');

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Employment Status Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-2xl shadow-lg text-white flex justify-between items-center">
                <div className="flex items-center">
                    <div className="p-3 bg-blue-600 rounded-xl mr-4 shadow-lg shadow-blue-900/50">
                        <Briefcase className="w-6 h-6 text-white"/>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">{userProfile.role}</h2>
                        <p className="text-sm text-slate-400">{userProfile.department} Department</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Employment Status</p>
                    {isProbation ? (
                        <div className="inline-flex items-center bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full text-xs font-bold border border-amber-500/30">
                            <Clock size={12} className="mr-2"/>
                            Probation (Ends {probationEndDate.toLocaleDateString()})
                        </div>
                    ) : (
                        <div className="inline-flex items-center bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/30">
                            <CheckCircle size={12} className="mr-2"/>
                            Permanent Employee
                        </div>
                    )}
                    <p className="text-xs text-slate-500 mt-2">Joined: {joiningDate.toLocaleDateString()}</p>
                </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-xl font-bold text-slate-800">Personal Information</h2>
                    {!isEditing && !pendingRequest && (
                        <button onClick={() => setIsEditing(true)} className="flex items-center text-sm bg-blue-50 text-blue-600 border border-blue-100 px-4 py-2 rounded-lg hover:bg-blue-100 transition font-semibold">
                            <Edit3 size={16} className="mr-2"/> Edit Details
                        </button>
                    )}
                </div>

                {pendingRequest && (
                    <div className="bg-amber-50 text-amber-800 p-4 rounded-xl mb-6 flex items-center border border-amber-100">
                        <Clock className="w-5 h-5 mr-3"/>
                        <div>
                            <p className="font-bold text-sm">Update Pending Approval</p>
                            <p className="text-xs">Your request to update profile information is currently being reviewed by {pendingRequest.type === 'bank_update' ? 'Finance' : 'HR'}.</p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* General Info */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center border-b pb-2"><User className="w-4 h-4 mr-2"/> Personal</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Full Name</label>
                                <input disabled className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-500 cursor-not-allowed text-sm" value={`${formData.firstName} ${formData.lastName}`} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
                                <input disabled className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-500 cursor-not-allowed text-sm" value={formData.email} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Phone</label>
                                <input name="phone" disabled={!isEditing} onChange={handleChange} className={`w-full border p-2.5 rounded-lg text-sm ${isEditing ? 'bg-white border-blue-300 focus:ring-2 focus:ring-blue-500 outline-none' : 'bg-slate-50 border-slate-200'}`} value={formData.phone || ''} placeholder="+92..." />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Address</label>
                                <textarea name="address" disabled={!isEditing} onChange={handleChange} className={`w-full border p-2.5 rounded-lg text-sm ${isEditing ? 'bg-white border-blue-300 focus:ring-2 focus:ring-blue-500 outline-none' : 'bg-slate-50 border-slate-200'}`} value={formData.address || ''} placeholder="Home Address" />
                            </div>
                        </div>
                    </div>

                    {/* Bank Info */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center border-b pb-2"><Building className="w-4 h-4 mr-2"/> Financial</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Bank Name</label>
                                <input name="bankName" disabled={!isEditing} onChange={handleChange} className={`w-full border p-2.5 rounded-lg text-sm ${isEditing ? 'bg-white border-blue-300 focus:ring-2 focus:ring-blue-500 outline-none' : 'bg-slate-50 border-slate-200'}`} value={formData.bankName || ''} placeholder="e.g. Meezan Bank" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Account Title</label>
                                <input disabled className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-500 text-sm" value={`${formData.firstName} ${formData.lastName}`} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Account Number</label>
                                <input name="accountNumber" disabled={!isEditing} onChange={handleChange} className={`w-full border p-2.5 rounded-lg text-sm ${isEditing ? 'bg-white border-blue-300 focus:ring-2 focus:ring-blue-500 outline-none' : 'bg-slate-50 border-slate-200'}`} value={formData.accountNumber || ''} placeholder="Account Number" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">IBAN</label>
                                <input name="iban" disabled={!isEditing} onChange={handleChange} className={`w-full border p-2.5 rounded-lg text-sm ${isEditing ? 'bg-white border-blue-300 focus:ring-2 focus:ring-blue-500 outline-none' : 'bg-slate-50 border-slate-200'}`} value={formData.iban || ''} placeholder="PK..." />
                            </div>
                        </div>
                    </div>
                </div>

                {isEditing && (
                    <div className="mt-8 flex justify-end space-x-4 pt-6 border-t border-slate-100">
                        <button onClick={() => {setIsEditing(false); setFormData(userProfile)}} className="px-6 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold text-sm">Cancel</button>
                        <button onClick={handleSave} className="px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 text-sm shadow-lg shadow-blue-500/30 transition-all">
                            {userProfile.hasEditedProfile ? 'Submit for Approval' : 'Save Profile'}
                        </button>
                    </div>
                )}

                {/* Compensation Overview - Added */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mt-8">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center uppercase tracking-wider">
                      <DollarSign className="w-4 h-4 mr-2 text-emerald-600"/> Compensation Breakdown
                    </h3>
                    <div className={`px-3 py-1 rounded text-[10px] font-bold border uppercase tracking-wider ${formData.pfStatus === 'Active' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
                        PF: {formData.pfStatus || 'Inactive'}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Monthly Base Salary</p>
                       <p className="text-xl font-bold text-slate-800">PKR {(formData.baseSalary || 0).toLocaleString()}</p>
                     </div>
                     <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Est. Monthly Tax</p>
                       <p className="text-xl font-bold text-rose-600">- PKR {calculatePKTax(formData.baseSalary || 0).toLocaleString()}</p>
                     </div>
                     <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm">
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Provident Fund (50%)</p>
                       <p className={`text-xl font-bold ${pfAmount > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                           {pfAmount > 0 ? `- PKR ${pfAmount.toLocaleString()}` : 'N/A'}
                       </p>
                     </div>
                  </div>
                  <div className="mt-4 flex items-center text-xs text-slate-500 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                    <AlertTriangle className="w-4 h-4 text-blue-500 mr-2" />
                    Note: Late arrival penalties and other variable deductions are calculated at month-end and will appear on your final payslip.
                  </div>
                </div>
            </div>
        </div>
    );
};

const AttendancePanel = ({ userProfile, db }) => {
  const [locationStatus, setLocationStatus] = useState('Checking...');
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [todaysRecord, setTodaysRecord] = useState(null);
  const [claims, setClaims] = useState('');
  const [denials, setDenials] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoFencingEnabled, setGeoFencingEnabled] = useState(false);
  const [shifts, setShifts] = useState(DEFAULT_SHIFTS);
  const [reason, setReason] = useState(''); // Reason for low KPI

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!userProfile) return;
    const settingsUnsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGeoFencingEnabled(data.geoFencingEnabled || false);
        if(data.shifts) setShifts(data.shifts);
      }
    });

    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'attendance'), 
      where('userId', '==', userProfile.uid),
      where('date', '==', todayStr)
    );
    
    const recordUnsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setTodaysRecord({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setTodaysRecord(null);
      }
    });

    let watchId;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const dist = calculateDistance(
            position.coords.latitude, 
            position.coords.longitude, 
            DEFAULT_OFFICE_LOCATION.lat, 
            DEFAULT_OFFICE_LOCATION.lng
          );
          
          if (!geoFencingEnabled) {
            setCanCheckIn(true);
            setLocationStatus('Ready: Geo-Fencing Inactive');
          } else if (dist <= DEFAULT_OFFICE_LOCATION.radius) {
            setCanCheckIn(true);
            setLocationStatus('Verified: Inside Office Zone');
          } else {
            setCanCheckIn(false); 
            setLocationStatus(`Outside Zone (${Math.round(dist)}m away)`);
          }
        },
        (err) => {
          if (!geoFencingEnabled) {
             setCanCheckIn(true);
             setLocationStatus('Ready: Geo-Fencing Inactive');
          } else {
             setLocationStatus('GPS Error: ' + err.message);
             setCanCheckIn(false);
          }
        }
      );
    } else {
      setLocationStatus('Geolocation not supported');
    }

    return () => { settingsUnsub(); recordUnsub(); if(watchId) navigator.geolocation.clearWatch(watchId); };
  }, [userProfile, geoFencingEnabled]);

  const handleCheckIn = async () => {
    setLoading(true);
    const now = new Date().toISOString();
    const userShift = shifts[userProfile.shift] || shifts['Morning'];
    const [sHour, sMin] = userShift.start.split(':').map(Number);
    const checkIn = new Date(now);
    const shiftDate = new Date(checkIn);
    shiftDate.setHours(sHour, sMin, 0, 0);
    const graceLimit = new Date(shiftDate.getTime() + 15 * 60000);
    const late = checkIn > graceLimit;
    
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'attendance'), {
      userId: userProfile.uid,
      userName: `${userProfile.firstName} ${userProfile.lastName}`,
      date: todayStr,
      checkInTime: now,
      checkOutTime: null,
      status: late ? 'Late' : 'Present',
      shift: userProfile.shift
    });
    setLoading(false);
  };

  const handleCheckOut = async () => {
    if (!claims || !denials) {
      alert("Please enter work output (Claims/Denials) before checking out.");
      return;
    }

    // KPI Logic for AR/Biller
    const claimsNum = parseInt(claims);
    const target = userProfile.dailyClaimTarget || 0;
    
    if (target > 0 && claimsNum < target && !reason) {
        alert(`Your target was ${target}. Please provide a reason for low performance.`);
        return;
    }

    setLoading(true);
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'attendance', todaysRecord.id), {
      checkOutTime: new Date().toISOString(),
      claimsProcessed: claimsNum,
      denialsWorked: parseInt(denials),
      lowPerformanceReason: reason || null
    });

    // Notify TL if target missed
    if (target > 0 && claimsNum < target) {
        // Find TL
        const nextStage = await findNextApprovalStage(1, userProfile.department, db);
        // Note: findNextApprovalStage returns a level number. We need a UID. 
        // For simplicity, we'll query for the TL of this dept.
        const qTL = query(collection(db, 'artifacts', appId, 'users'), where('role', '==', 'Team Lead'), where('department', '==', userProfile.department));
        const tlSnap = await getDocs(qTL);
        tlSnap.forEach(doc => {
            sendNotification(doc.id, 'Low Performance Alert', `${userProfile.firstName} processed ${claimsNum}/${target} claims. Reason: ${reason}`, db);
        });
    }

    setLoading(false);
  };

  return (
    <div className="max-w-xl mx-auto py-8">
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="bg-slate-900 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600/20 to-transparent"></div>
          <h2 className="text-2xl font-bold text-white relative z-10">Attendance Tracker</h2>
          <p className="text-blue-200 text-sm mt-1 relative z-10">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        
        <div className="p-8">
          <div className={`flex items-center justify-center p-3 rounded-xl mb-8 border ${canCheckIn ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
            <MapPin size={18} className="mr-2" />
            <span className="font-semibold text-sm">{locationStatus}</span>
          </div>

          {!todaysRecord ? (
            <div className="text-center">
              <button 
                disabled={!canCheckIn || loading}
                onClick={handleCheckIn}
                className={`w-full py-5 rounded-2xl text-lg font-bold text-white transition-all transform active:scale-95
                  ${canCheckIn 
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 shadow-lg shadow-blue-500/40 hover:shadow-blue-500/60' 
                    : 'bg-slate-200 cursor-not-allowed text-slate-400'}`}
              >
                {loading ? 'Processing...' : 'TAP TO CHECK IN'}
              </button>
              <p className="text-xs text-slate-400 mt-4">Ensure you are within 100m of the office premises.</p>
            </div>
          ) : !todaysRecord.checkOutTime ? (
            <div className="space-y-6 animate-in slide-in-from-bottom-4">
               <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                 <h4 className="font-bold text-slate-800 mb-4 flex items-center text-sm uppercase tracking-wide"><FileText size={16} className="mr-2 text-blue-500"/> Daily Output Report</h4>
                 <div className="space-y-4">
                   <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Claims Processed {userProfile.dailyClaimTarget > 0 && <span className="text-blue-600">(Target: {userProfile.dailyClaimTarget})</span>}</label>
                     <input type="number" placeholder="0" className="w-full border border-slate-300 bg-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" value={claims} onChange={e => setClaims(e.target.value)} />
                   </div>
                   <div>
                     <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Denials Worked</label>
                     <input type="number" placeholder="0" className="w-full border border-slate-300 bg-white p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" value={denials} onChange={e => setDenials(e.target.value)} />
                   </div>
                   
                   {/* Conditional Reason Field */}
                   {(parseInt(claims) < userProfile.dailyClaimTarget) && (
                       <div className="animate-in fade-in slide-in-from-top-2">
                           <label className="block text-xs font-bold text-rose-500 mb-1.5 ml-1">Reason for Low Target</label>
                           <textarea className="w-full border border-rose-300 bg-rose-50 p-3 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none" placeholder="Explain why..." value={reason} onChange={e => setReason(e.target.value)} />
                       </div>
                   )}
                 </div>
                 <button 
                    onClick={handleCheckOut}
                    disabled={loading}
                    className="w-full bg-slate-800 text-white py-4 rounded-xl mt-6 hover:bg-slate-900 transition font-bold shadow-lg"
                 >
                    {loading ? 'Processing...' : 'Submit & Check Out'}
                 </button>
               </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-in zoom-in">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Shift Completed</h3>
              <p className="text-slate-500 mt-1">Great work today!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const LeavesPanel = ({ userProfile, db }) => {
  const [showForm, setShowForm] = useState(false);
  const [leaveType, setLeaveType] = useState('Casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [myLeaves, setMyLeaves] = useState([]);
  const [leaveQuotas, setLeaveQuotas] = useState(DEFAULT_LEAVE_QUOTAS);

  useEffect(() => {
    if(!userProfile) return;
    
    // Fetch Global Rule
    getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global')).then(snap => {
        if(snap.exists() && snap.data().leaveQuotas) setLeaveQuotas(snap.data().leaveQuotas);
    });

    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'leaves'), where('userId', '==', userProfile.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      setMyLeaves(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });
    return () => unsubscribe();
  }, [userProfile]);

  // Calculate used days per type
  const calculateUsedDays = (type) => {
      return myLeaves
        .filter(l => l.status === 'Approved' && l.type === type)
        .reduce((total, l) => total + getDaysDifference(l.startDate, l.endDate), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Probation Check (3 Months = 90 Days)
    const joinDate = new Date(userProfile.joiningDate);
    const today = new Date();
    const diffTime = Math.abs(today - joinDate);
    const tenureDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (tenureDays < 90) {
        alert(`You are currently on probation (${tenureDays}/90 days). Leaves are not allowed during the first 3 months.`);
        return;
    }

    // Gender Validation
    if (leaveType === 'Maternity' && userProfile.gender !== 'Female') {
        alert("Maternity leave is only applicable for female employees.");
        return;
    }
    if (leaveType === 'Paternity' && userProfile.gender !== 'Male') {
        alert("Paternity leave is only applicable for male employees.");
        return;
    }

    // Quota Validation
    const requestedDays = getDaysDifference(startDate, endDate);
    const used = calculateUsedDays(leaveType);
    const quota = leaveQuotas[leaveType] || 0;

    if ((used + requestedDays) > quota) {
        alert(`Insufficient leave balance. You have ${quota - used} days remaining for ${leaveType}.`);
        return;
    }

    const initialStage = await findNextApprovalStage(1, userProfile.department, db);
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'leaves'), {
      userId: userProfile.uid,
      userName: `${userProfile.firstName} ${userProfile.lastName}`,
      userRole: userProfile.role,
      department: userProfile.department,
      type: leaveType,
      startDate,
      endDate,
      days: requestedDays,
      reason,
      status: 'Pending',
      currentStage: initialStage,
      stageHistory: [],
      createdAt: new Date().toISOString()
    });
    setShowForm(false);
    setReason('');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Leave Management</h2>
          <p className="text-sm text-slate-500">Track and manage your time off requests</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30 flex items-center font-semibold transition-all active:scale-95">
          <UserPlus size={18} className="mr-2" /> New Request
        </button>
      </div>

      {/* Leave Balances Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(leaveQuotas).map(([type, limit]) => {
              // Hide gender specific if not applicable
              if (type === 'Maternity' && userProfile.gender !== 'Female') return null;
              if (type === 'Paternity' && userProfile.gender !== 'Male') return null;

              const used = calculateUsedDays(type);
              const remaining = limit - used;
              
              return (
                  <div key={type} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-slate-400 uppercase">{type}</span>
                          {type === 'Maternity' ? <Baby size={14} className="text-pink-400"/> : 
                           type === 'Medical' ? <Activity size={14} className="text-red-400"/> :
                           <Calendar size={14} className="text-blue-400"/>}
                      </div>
                      <div className="flex items-end">
                          <span className="text-2xl font-bold text-slate-800">{remaining}</span>
                          <span className="text-xs text-slate-400 ml-1 mb-1">/ {limit} days</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{width: `${(used/limit)*100}%`}}></div>
                      </div>
                  </div>
              )
          })}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl border border-slate-100 shadow-lg space-y-6 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-bold text-slate-800 text-lg border-b border-slate-100 pb-4">Application Form</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Type</label>
              <select className="w-full border border-slate-200 bg-slate-50 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
                {Object.keys(leaveQuotas).map(type => {
                    if (type === 'Maternity' && userProfile.gender !== 'Female') return null;
                    if (type === 'Paternity' && userProfile.gender !== 'Male') return null;
                    return <option key={type} value={type}>{type}</option>
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">From</label>
              <input required type="date" className="w-full border border-slate-200 bg-slate-50 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">To</label>
              <input required type="date" className="w-full border border-slate-200 bg-slate-50 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Reason</label>
            <textarea required className="w-full border border-slate-200 bg-slate-50 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Please provide details..."></textarea>
          </div>
          <div className="flex justify-end space-x-4">
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2.5 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold">Cancel</button>
            <button type="submit" className="bg-slate-900 text-white px-8 py-2.5 rounded-xl font-semibold hover:bg-slate-800 transition-colors">Submit Request</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-xs border-b border-slate-200">
            <tr>
              <th className="p-5">Leave Type</th>
              <th className="p-5">Duration</th>
              <th className="p-5">Days</th>
              <th className="p-5">Status</th>
              <th className="p-5">Approval Stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {myLeaves.map(leave => (
              <tr key={leave.id} className="hover:bg-slate-50 transition-colors">
                <td className="p-5 font-semibold text-slate-700">{leave.type}</td>
                <td className="p-5 text-slate-600">{leave.startDate} <span className="text-slate-400 px-2">to</span> {leave.endDate}</td>
                <td className="p-5 font-bold">{getDaysDifference(leave.startDate, leave.endDate)}</td>
                <td className="p-5">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border
                    ${leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                      leave.status === 'Rejected' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                    {leave.status}
                  </span>
                </td>
                <td className="p-5 text-slate-500 text-xs">
                  {leave.status === 'Pending' ? (
                    <div className="flex items-center">
                       <div className="w-2 h-2 rounded-full bg-blue-500 mr-2 animate-pulse"></div>
                       Level {leave.currentStage} Review
                    </div>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SystemAdmin = ({ userProfile, db }) => {
  const [geoFencingEnabled, setGeoFencingEnabled] = useState(false);
  const [shifts, setShifts] = useState(DEFAULT_SHIFTS);
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);
  const [newDept, setNewDept] = useState('');
  const [leaveQuotas, setLeaveQuotas] = useState(DEFAULT_LEAVE_QUOTAS);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsContent, setNewsContent] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGeoFencingEnabled(data.geoFencingEnabled || false);
        if(data.shifts) setShifts(data.shifts);
        if(data.departments) setDepartments(data.departments);
        if(data.leaveQuotas) setLeaveQuotas(data.leaveQuotas);
      }
    });
    return () => unsub();
  }, []);

  const saveSettings = async (updates) => {
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global'), updates, { merge: true });
  };

  const toggleGeoFencing = () => {
    const newVal = !geoFencingEnabled;
    setGeoFencingEnabled(newVal); 
    saveSettings({ geoFencingEnabled: newVal });
  };

  const postAnnouncement = async () => {
      if(!newsTitle || !newsContent) return;
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'announcements'), {
          title: newsTitle,
          content: newsContent,
          author: `${userProfile.firstName} ${userProfile.lastName}`,
          date: new Date().toISOString()
      });
      setNewsTitle('');
      setNewsContent('');
      alert("Announcement Posted");
  };

  const handleShiftChange = (shiftName, field, value) => {
    const updated = { ...shifts, [shiftName]: { ...shifts[shiftName], [field]: value } };
    setShifts(updated);
  };
  const saveShifts = () => { saveSettings({ shifts }); alert("Shifts updated"); };
  
  const addDepartment = () => { if(!newDept || departments.includes(newDept)) return; const updated = [...departments, newDept]; setDepartments(updated); setNewDept(''); saveSettings({ departments: updated }); };
  const removeDepartment = (dept) => { const updated = departments.filter(d => d !== dept); setDepartments(updated); saveSettings({ departments: updated }); };

  const handleQuotaChange = (type, val) => {
      setLeaveQuotas({...leaveQuotas, [type]: parseInt(val) || 0});
  };

  return (
    <div className="space-y-8">
      {/* Config Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 text-white rounded-2xl shadow-lg p-6 border border-slate-700">
             <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                    <Globe className="text-blue-400 mr-3"/> 
                    <h3 className="font-bold text-lg">Geo-Fencing</h3>
                </div>
                <button onClick={toggleGeoFencing} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${geoFencingEnabled ? 'bg-blue-600' : 'bg-slate-600'}`}>
                    <span className={`${geoFencingEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`}/>
                </button>
             </div>
             <p className="text-sm text-slate-400 mb-6">Restrict attendance check-in to office location coordinates.</p>
             
             <div className="border-t border-slate-700 pt-4">
                 <div className="flex items-center mb-4">
                     <Calendar className="text-emerald-400 mr-3"/> 
                     <h3 className="font-bold text-lg">Annual Leave Quotas</h3>
                 </div>
                 <div className="grid grid-cols-3 gap-3">
                     {['Casual', 'Medical', 'Emergency'].map(type => (
                         <div key={type}>
                             <label className="text-xs font-bold text-slate-400 uppercase block mb-1">{type}</label>
                             <input 
                                type="number" 
                                className="bg-slate-800 border border-slate-600 rounded p-2 text-white w-full" 
                                value={leaveQuotas[type]} 
                                onChange={e => handleQuotaChange(type, e.target.value)} 
                             />
                         </div>
                     ))}
                 </div>
                 <div className="mt-4 flex justify-end">
                     <button onClick={() => saveSettings({ leaveQuotas })} className="text-sm bg-emerald-600 px-4 py-2 rounded font-bold hover:bg-emerald-500">Save Quotas</button>
                 </div>
             </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center"><Megaphone className="mr-2 text-blue-600"/> Post Announcement</h3>
              <input className="w-full border p-2 rounded mb-2" placeholder="Title" value={newsTitle} onChange={e => setNewsTitle(e.target.value)} />
              <textarea className="w-full border p-2 rounded mb-2" rows={3} placeholder="Message content..." value={newsContent} onChange={e => setNewsContent(e.target.value)} />
              <button onClick={postAnnouncement} className="bg-blue-600 text-white px-4 py-2 rounded font-bold w-full">Post to Dashboard</button>
          </div>
      </div>

      {/* Dept & Shift (Same as before) */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 text-lg mb-6 flex items-center"><Building className="mr-2 text-emerald-600"/> Departments</h3>
        <div className="flex space-x-4 mb-6">
          <input 
            value={newDept} 
            onChange={e => setNewDept(e.target.value)} 
            placeholder="New Department Name" 
            className="flex-1 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button onClick={addDepartment} className="bg-emerald-600 text-white px-6 rounded-xl font-bold hover:bg-emerald-700 flex items-center">
            <Plus size={18} className="mr-2"/> Add
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {departments.map(dept => (
            <div key={dept} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100 group hover:border-emerald-200 transition-colors">
              <span className="font-medium text-slate-700">{dept}</span>
              <button onClick={() => removeDepartment(dept)} className="text-slate-400 hover:text-rose-500">
                <Trash2 size={16}/>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MainApp = () => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Dashboard');

  useEffect(() => {
    
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'artifacts', appId, 'users', u.uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setUserProfile(snap.data());
        } else {
           setUserProfile({
             uid: u.uid,
             firstName: 'Guest',
             lastName: 'User',
             role: 'Employee',
             gender: 'Male',
             shift: 'Morning',
             hasEditedProfile: false
           });
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-slate-500 font-medium animate-pulse">Initializing Portal...</p>
    </div>
  );

  if (!user) {
    return <AuthScreen />;
  }

  if (!userProfile) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium animate-pulse">Loading Profile...</p>
      </div>
    );
  }

  const renderContent = (currentTab) => {
    switch (currentTab) {
      case 'Dashboard': return <Dashboard userProfile={userProfile} db={db} />;
      case 'My Profile': return <UserProfile userProfile={userProfile} db={db} />;
      case 'Attendance': return <AttendancePanel userProfile={userProfile} db={db} />;
      case 'Leaves': return <LeavesPanel userProfile={userProfile} db={db} />;
      case 'Dept Requests': return <DepartmentRequests userProfile={userProfile} db={db} />;
      case 'Approvals': return <ApprovalQueue userProfile={userProfile} db={db} />;
      case 'Payroll Run': 
      case 'My Payslips': return <PayrollPanel userProfile={userProfile} db={db} />;
      case 'Staff Directory': return <StaffDirectory userProfile={userProfile} db={db} />;
      case 'System Admin': return <SystemAdmin userProfile={userProfile} db={db} />;
      default: return <Dashboard userProfile={userProfile} db={db} />;
    }
  };

  return (
    <Layout 
      user={user} 
      userProfile={userProfile} 
      onLogout={handleLogout}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    >
      {renderContent(activeTab)}
    </Layout>
  );
};

export default MainApp;