'use client';
import { useEffect, useState } from 'react';
import { auth } from '../../firebase';
import {
	signInWithPopup,
	GoogleAuthProvider,
	signOut,
	User,
	onAuthStateChanged,
} from 'firebase/auth';
import { db } from '../../firebase';
import {
	collection,
	addDoc,
	query,
	where,
	limit,
	getDocs,
	updateDoc,
	doc,
	Timestamp,
} from 'firebase/firestore';
import Link from 'next/link';

type LocalEntry = {
	id?: string | null;
	swapIn: string | null;
	swapOut: string | null;
	synced?: boolean;
	swapOutSynced?: boolean;
};

const DEFAULT_TIMES = [
	'17:15',
	'17:30',
	'18:10',
	'18:20',
	'18:20',
	'19:15',
	'19:45',
];

export default function Dashboard() {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [swapIn, setSwapIn] = useState<Date | null>(null);
	const [swapOut, setSwapOut] = useState<Date | null>(null);
	const [progress, setProgress] = useState<number>(0);
	const [duration, setDuration] = useState<number>(0); // in ms
	const [customTime, setCustomTime] = useState<string>('');
	const [entryId, setEntryId] = useState<string | null>(null);
	const [busTimes, setBusTimes] = useState<{ id: string; time: string }[]>(
		[],
	);

	const WORK_DURATION_MS = 3 * 60 * 60 * 1000 + 40 * 60 * 1000; // 3h 40m

	// Monitor auth state
	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
			setUser(firebaseUser);
			setLoading(false);
		});
		return () => unsubscribe();
	}, []);

	// Load today's entry if exists
	useEffect(() => {
		if (!user) return;
		(async () => {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const tomorrow = new Date(today);
			tomorrow.setDate(today.getDate() + 1);
			const q = query(
				collection(db, 'entries'),
				where('userId', '==', user.uid),
				where('swapIn', '>=', Timestamp.fromDate(today)),
				where('swapIn', '<', Timestamp.fromDate(tomorrow)),
				limit(1),
			);
			const snap = await getDocs(q);
			if (!snap.empty) {
				const docData = snap.docs[0].data();
				setSwapIn(docData.swapIn.toDate());
				setEntryId(snap.docs[0].id);
				if (docData.swapOut) setSwapOut(docData.swapOut.toDate());
			}
		})();
	}, [user]);

	// Progress timer
	useEffect(() => {
		if (!swapIn || swapOut) return;
		const interval = setInterval(() => {
			const now = new Date();
			const elapsed = now.getTime() - swapIn.getTime();
			setDuration(elapsed);
			setProgress(Math.min(1, elapsed / WORK_DURATION_MS));
		}, 1000);
		return () => clearInterval(interval);
	}, [swapIn, swapOut, WORK_DURATION_MS]);

	// Utility: Save and load local state for offline-first
	function saveLocalEntry(entry: LocalEntry) {
		localStorage.setItem('shift-track-entry', JSON.stringify(entry));
	}
	function loadLocalEntry(): LocalEntry | null {
		const raw = localStorage.getItem('shift-track-entry');
		if (!raw) return null;
		try {
			return JSON.parse(raw);
		} catch {
			return null;
		}
	}
	function clearLocalEntry() {
		localStorage.removeItem('shift-track-entry');
	}

	const syncEntryToFirestore = async (entry: LocalEntry, userId: string) => {
		if (!navigator.onLine || !userId) return;
		if (entry && !entry.synced) {
			if (!entry.id && entry.swapIn) {
				// Create new entry
				const docRef = await addDoc(collection(db, 'entries'), {
					userId,
					swapIn: Timestamp.fromDate(new Date(entry.swapIn)),
					createdAt: Timestamp.now(),
					...(entry.swapOut && {
						swapOut: Timestamp.fromDate(new Date(entry.swapOut)),
					}),
				});
				entry.id = docRef.id;
				entry.synced = true;
				saveLocalEntry(entry);
			} else if (entry.id && entry.swapOut && !entry.swapOutSynced) {
				// Update swapOut
				await updateDoc(doc(db, 'entries', entry.id), {
					swapOut: Timestamp.fromDate(new Date(entry.swapOut)),
				});
				entry.swapOutSynced = true;
				entry.synced = true;
				saveLocalEntry(entry);
			}
		}
	};

	// On mount, load local entry if exists
	useEffect(() => {
		const local = loadLocalEntry();
		if (local) {
			setSwapIn(local.swapIn ? new Date(local.swapIn) : null);
			setSwapOut(local.swapOut ? new Date(local.swapOut) : null);
			setEntryId(local.id || null);
		}
	}, []);

	// On swapIn/swapOut, save to localStorage and try to sync
	useEffect(() => {
		if (!user) return;
		const entry: LocalEntry = {
			id: entryId,
			swapIn: swapIn ? swapIn.toISOString() : null,
			swapOut: swapOut ? swapOut.toISOString() : null,
			synced: false,
			swapOutSynced: false,
		};
		if (swapIn && !swapOut) {
			entry.synced = false;
		} else if (swapIn && swapOut) {
			entry.synced = false;
			entry.swapOutSynced = false;
		}
		if (swapIn) saveLocalEntry(entry);
		if (swapIn) syncEntryToFirestore(entry, user.uid);
		if (swapIn && swapOut) clearLocalEntry();
	}, [swapIn, swapOut, entryId, user, syncEntryToFirestore]);

	const handleSignIn = async () => {
		const provider = new GoogleAuthProvider();
		await signInWithPopup(auth, provider);
	};

	const handleSignOut = async () => {
		await signOut(auth);
	};

	const handleStart = async () => {
		const now = customTime
			? new Date(`${new Date().toISOString().slice(0, 10)}T${customTime}`)
			: new Date();
		setSwapIn(now);
		setSwapOut(null);
		setEntryId(null);
		// Save locally immediately
		saveLocalEntry({
			swapIn: now.toISOString(),
			swapOut: null,
			id: null,
			synced: false,
		});
		// Try to sync in background
		if (user)
			syncEntryToFirestore(
				{
					swapIn: now.toISOString(),
					swapOut: null,
					id: null,
					synced: false,
				},
				user.uid,
			);
	};

	const handleStop = async () => {
		if (!swapIn) return;
		const now = new Date();
		setSwapOut(now);
		// Save locally immediately
		const local = loadLocalEntry();
		const entry: LocalEntry = {
			id: local?.id || null,
			swapIn: local?.swapIn || swapIn.toISOString(),
			swapOut: now.toISOString(),
			synced: false,
			swapOutSynced: false,
		};
		saveLocalEntry(entry);
		// Try to sync in background
		if (user) syncEntryToFirestore(entry, user.uid);
	};

	function formatDuration(ms: number) {
		const h = Math.floor(ms / 3600000);
		const m = Math.floor((ms % 3600000) / 60000);
		const s = Math.floor((ms % 60000) / 1000);
		return `${h ? h + 'h ' : ''}${m}m ${s}s`;
	}

	// PWA: Register service worker for offline support
	useEffect(() => {
		if ('serviceWorker' in navigator) {
			window.addEventListener('load', () => {
				navigator.serviceWorker.register('/sw.js').catch(() => {});
			});
		}
	}, []);

	// Fetch bus times for lookup and recommendation
	useEffect(() => {
		if (!user) return;
		const fetchBusTimes = async () => {
			const colRef = collection(db, 'users', user.uid, 'busTimes');
			const snap = await getDocs(colRef);
			if (snap.empty) {
				// Set default times for new user
				await Promise.all(
					DEFAULT_TIMES.map(t =>
						addDoc(collection(db, 'users', user.uid, 'busTimes'), {
							time: t,
						}),
					),
				);
				// Fetch again after setting
				const newSnap = await getDocs(colRef);
				const newData = newSnap.docs.map(d => ({
					id: d.id,
					...(d.data() as { time: string }),
				}));
				setBusTimes(
					newData.sort((a, b) => a.time.localeCompare(b.time)),
				);
				return;
			}
			const data = snap.docs.map(d => ({
				id: d.id,
				...(d.data() as { time: string }),
			}));
			setBusTimes(data.sort((a, b) => a.time.localeCompare(b.time)));
		};
		fetchBusTimes();
	}, [user]);

	if (loading) return <div className='p-8'>Loading...</div>;

	if (!user) {
		return (
			<div className='flex flex-col items-center justify-center min-h-screen'>
				<h1 className='text-2xl font-bold mb-4'>
					Sign in to Track Your Time
				</h1>
				<button
					onClick={handleSignIn}
					className='bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700'
				>
					Sign in with Google
				</button>
			</div>
		);
	}

	// Calculate expected end time and best bus
	const expectedEnd =
		swapIn && !swapOut
			? new Date(swapIn.getTime() + WORK_DURATION_MS)
			: null;
	const expectedEndStr = expectedEnd
		? expectedEnd.toTimeString().slice(0, 5)
		: null;
	const bestBus = expectedEndStr
		? busTimes.find(b => b.time >= expectedEndStr)
		: null;

	return (
		<div className='flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-green-100 p-4'>
			<div className='bg-white/90 shadow-xl rounded-2xl px-8 py-10 w-full max-w-md flex flex-col items-center gap-6 border border-gray-100'>
				<h1 className='text-3xl font-extrabold text-gray-800 mb-2 tracking-tight text-center'>
					{user.displayName
						? `Welcome, ${user.displayName}`
						: 'Welcome'}
				</h1>
				<button
					onClick={handleSignOut}
					className='absolute top-6 right-6 text-gray-400 hover:text-gray-700 transition-colors text-sm font-medium'
					style={{ position: 'absolute', right: 32, top: 32 }}
				>
					Sign Out
				</button>
				{/* Time tracking UI */}
				{!swapIn ? (
					<div className='flex flex-col items-center gap-6 w-full'>
						<div className='flex flex-col gap-2 w-full'>
							<label
								className='text-gray-600 text-sm font-medium mb-1'
								htmlFor='start-time'
							>
								Optional start time
							</label>
							<input
								id='start-time'
								type='time'
								value={customTime}
								onChange={e => setCustomTime(e.target.value)}
								className='border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 transition w-full bg-white'
							/>
						</div>
						<button
							onClick={handleStart}
							className='w-full bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white font-bold py-3 rounded-xl shadow-lg text-lg transition-all duration-200'
						>
							<span className='inline-flex items-center gap-2'>
								<svg
									width='22'
									height='22'
									fill='none'
									viewBox='0 0 24 24'
								>
									<circle
										cx='12'
										cy='12'
										r='10'
										stroke='currentColor'
										strokeWidth='2'
									/>
									<path
										d='M12 7v5l3 3'
										stroke='currentColor'
										strokeWidth='2'
										strokeLinecap='round'
									/>
								</svg>
								Start
							</span>
						</button>
					</div>
				) : !swapOut ? (
					<div className='flex flex-col items-center gap-8 w-full'>
						<div className='w-full flex flex-col gap-2'>
							<div className='flex justify-between text-xs text-gray-500 font-medium'>
								<span>Elapsed</span>
								<span>3h 40m</span>
							</div>
							<div className='relative w-full h-5 bg-gray-200 rounded-full overflow-hidden'>
								<div
									className='absolute left-0 top-0 h-full bg-gradient-to-r from-green-400 to-blue-500 transition-all duration-300'
									style={{ width: `${progress * 100}%` }}
								></div>
								<div className='absolute w-full h-full flex items-center justify-center text-xs font-semibold text-gray-700'>
									{formatDuration(duration)}
								</div>
							</div>
							<div className='text-center text-gray-500 text-sm mt-2'>
								{duration < WORK_DURATION_MS ? (
									<span>
										{formatDuration(
											WORK_DURATION_MS - duration,
										)}{' '}
										left
									</span>
								) : (
									<span className='text-green-600 font-semibold'>
										You have completed your work duration!
									</span>
								)}
							</div>
						</div>
						<button
							onClick={() => {
								if (
									window.confirm(
										'Are you sure you want to swap out?',
									)
								)
									handleStop();
							}}
							className='w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-bold py-3 rounded-xl shadow-lg text-lg transition-all duration-200'
						>
							<span className='inline-flex items-center gap-2'>
								<svg
									width='22'
									height='22'
									fill='none'
									viewBox='0 0 24 24'
								>
									<circle
										cx='12'
										cy='12'
										r='10'
										stroke='currentColor'
										strokeWidth='2'
									/>
									<path
										d='M16 12H8'
										stroke='currentColor'
										strokeWidth='2'
										strokeLinecap='round'
									/>
								</svg>
								Stop
							</span>
						</button>
					</div>
				) : (
					<div className='flex flex-col items-center gap-4 w-full'>
						<div className='text-green-700 font-bold text-lg flex items-center gap-2'>
							<svg
								width='22'
								height='22'
								fill='none'
								viewBox='0 0 24 24'
							>
								<circle
									cx='12'
									cy='12'
									r='10'
									stroke='currentColor'
									strokeWidth='2'
								/>
								<path
									d='M8 12l2.5 2.5L16 9'
									stroke='currentColor'
									strokeWidth='2'
									strokeLinecap='round'
								/>
							</svg>
							Session complete!
						</div>
						<div className='bg-gray-50 rounded-lg p-4 w-full text-center text-gray-700 shadow-inner'>
							<div className='mb-1'>
								<span className='font-semibold'>Swap In:</span>{' '}
								{swapIn.toLocaleTimeString()}
							</div>
							<div className='mb-1'>
								<span className='font-semibold'>Swap Out:</span>{' '}
								{swapOut.toLocaleTimeString()}
							</div>
							<div>
								<span className='font-semibold'>Total:</span>{' '}
								{formatDuration(
									swapOut.getTime() - swapIn.getTime(),
								)}
							</div>
						</div>
					</div>
				)}
				{/* After the progress bar/summary, show best bus recommendation if available */}
				{swapIn && !swapOut && bestBus && (
					<div className='w-full mt-4 flex flex-col items-center'>
						<div className='bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-blue-800 font-semibold text-center shadow'>
							<span className='mr-2'>
								Best Bus After Session:
							</span>
							<span className='text-blue-900 font-bold text-lg'>
								{bestBus.time}
							</span>
						</div>
					</div>
				)}
				<div className='flex justify-center mt-8'>
					<Link
						href='/dashboard/history'
						className='text-blue-600 hover:underline text-sm font-medium'
					>
						View Work History
					</Link>
				</div>
			</div>
		</div>
	);
}
