'use client';
import { useEffect, useState, useRef } from 'react';
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
	writeBatch,
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

// Theme toggle for dark mode
function ThemeToggle() {
	const [dark, setDark] = useState(false);
	useEffect(() => {
		if (dark) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}, [dark]);
	return (
		<button
			aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
			onClick={() => setDark(d => !d)}
			className='absolute top-4 right-4 z-20 p-2 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-200 shadow hover:bg-primary-200 dark:hover:bg-primary-800 transition'
			style={{ position: 'absolute', right: 16, top: 16 }}
		>
			{dark ? (
				<svg width='22' height='22' fill='none' viewBox='0 0 24 24'>
					<path
						d='M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z'
						stroke='currentColor'
						strokeWidth='2'
					/>
				</svg>
			) : (
				<svg width='22' height='22' fill='none' viewBox='0 0 24 24'>
					<circle
						cx='12'
						cy='12'
						r='5'
						stroke='currentColor'
						strokeWidth='2'
					/>
					<path
						d='M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'
						stroke='currentColor'
						strokeWidth='2'
					/>
				</svg>
			)}
		</button>
	);
}

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
	const [entryLoading, setEntryLoading] = useState(true); // loading state for today's entry

	const WORK_DURATION_MS = 3 * 60 * 60 * 1000 + 40 * 60 * 1000; // 3h 40m

	const swapOutButtonRef = useRef<HTMLButtonElement>(null);

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
		if (!user) {
			setEntryLoading(false); // Fix: ensure entryLoading is false if no user
			return;
		}
		setEntryLoading(true);
		(async () => {
			try {
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const tomorrow = new Date(today);
				tomorrow.setDate(today.getDate() + 1);
				// IMPORTANT: Make sure you have created the required Firestore index for this query in the Firebase Console if you see an error.
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
					const swapInDate = docData.swapIn.toDate();
					const swapOutDate = docData.swapOut
						? docData.swapOut.toDate()
						: null;
					// Only update state if changed
					if (!swapIn || swapIn.getTime() !== swapInDate.getTime())
						setSwapIn(swapInDate);
					if (!entryId || entryId !== snap.docs[0].id)
						setEntryId(snap.docs[0].id);
					if (
						swapOutDate &&
						(!swapOut ||
							swapOut.getTime() !== swapOutDate.getTime())
					)
						setSwapOut(swapOutDate);
				}
			} catch (err) {
				console.error("Error fetching today's entry:", err);
			} finally {
				setEntryLoading(false);
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
			try {
				if (!entry.id && entry.swapIn) {
					// Create new entry
					const docRef = await addDoc(collection(db, 'entries'), {
						userId,
						swapIn: Timestamp.fromDate(new Date(entry.swapIn)),
						createdAt: Timestamp.now(),
						...(entry.swapOut && {
							swapOut: Timestamp.fromDate(
								new Date(entry.swapOut),
							),
						}),
					});
					entry.id = docRef.id;
					entry.synced = true;
					saveLocalEntry(entry);
				} else if (entry.id && entry.swapOut && !entry.swapOutSynced) {
					// Update swapOut only if changed
					await updateDoc(doc(db, 'entries', entry.id), {
						swapOut: Timestamp.fromDate(new Date(entry.swapOut)),
					});
					entry.swapOutSynced = true;
					entry.synced = true;
					saveLocalEntry(entry);
				}
			} catch (err) {
				console.error('Error syncing entry to Firestore:', err);
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

	// On swapIn/swapOut, save to localStorage (but do NOT sync to Firestore here)
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
		if (swapIn && swapOut) clearLocalEntry();
	}, [swapIn, swapOut, entryId, user]);

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
			try {
				const colRef = collection(db, 'users', user.uid, 'busTimes');
				const snap = await getDocs(colRef);
				if (snap.empty) {
					// Set default times for new user using batch for performance
					const batch = writeBatch(db);
					DEFAULT_TIMES.forEach(t => {
						const docRef = doc(
							collection(db, 'users', user.uid, 'busTimes'),
						);
						batch.set(docRef, { time: t });
					});
					await batch.commit();
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
			} catch (err) {
				console.error('Error fetching bus times:', err);
			}
		};
		fetchBusTimes();
	}, [user]);

	// Show loading state for today's entry fetch
	if (loading || entryLoading)
		return (
			<div className='flex flex-col items-center justify-center min-h-screen bg-background dark:bg-background-dark transition-colors duration-300'>
				<ThemeToggle />
				<div className='flex flex-col items-center gap-4'>
					<span className='w-14 h-14 flex items-center justify-center'>
						<svg
							className='animate-spin text-primary-600 dark:text-primary-400'
							width='56'
							height='56'
							viewBox='0 0 56 56'
							fill='none'
						>
							<circle
								cx='28'
								cy='28'
								r='24'
								stroke='#e0e7ef'
								strokeWidth='8'
							/>
							<path
								d='M52 28a24 24 0 1 1-8.485-18.01'
								stroke='#2563eb'
								strokeWidth='8'
								strokeLinecap='round'
							/>
						</svg>
					</span>
					<span className='text-primary-700 dark:text-primary-200 text-lg font-semibold tracking-wide'>
						Loading...
					</span>
				</div>
			</div>
		);

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
		<div className='flex flex-col items-center justify-center min-h-screen bg-background dark:bg-background-dark transition-colors duration-300 p-4'>
			<ThemeToggle />
			<div className='bg-card dark:bg-card-dark shadow-xl rounded-2xl px-4 sm:px-8 py-8 sm:py-10 w-full max-w-md flex flex-col items-center gap-6 border border-border dark:border-border-dark transition-colors duration-300 relative'>
				<h1 className='text-3xl font-extrabold text-primary-900 dark:text-primary-100 mb-2 tracking-tight text-center'>
					{user.displayName
						? `Welcome, ${user.displayName}`
						: 'Welcome'}
				</h1>
				<button
					onClick={handleSignOut}
					className='absolute top-4 right-4 text-primary-400 dark:text-primary-300 hover:text-primary-700 dark:hover:text-primary-100 transition-colors text-sm font-medium'
					style={{ right: 56, top: 16 }}
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
							ref={swapOutButtonRef}
							onClick={() => {
								if (
									window.confirm(
										'Are you sure you want to swap out?',
									)
								) {
									handleStop();
								}
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
						<div className='bg-blue-50 dark:bg-primary-900 border border-blue-200 dark:border-primary-700 rounded-lg px-4 py-3 text-blue-800 dark:text-primary-100 font-semibold text-center shadow'>
							<span className='mr-2'>
								Best Bus After Session:
							</span>
							<span className='text-blue-900 dark:text-primary-200 font-bold text-lg'>
								{bestBus.time}
							</span>
						</div>
					</div>
				)}
				{/* Action buttons: Work History and Bus Timings, stacked and prominent for mobile */}
				<div className='flex flex-col gap-4 w-full mt-8'>
					<Link
						href='/dashboard/history'
						className='inline-flex items-center justify-center w-full px-6 py-4 bg-secondary dark:bg-secondary-dark text-primary-700 dark:text-primary-200 rounded-xl shadow text-lg font-semibold transition-all duration-200 hover:bg-primary-50 dark:hover:bg-primary-900 active:bg-primary-100 dark:active:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2'
						style={{ minHeight: 56 }}
					>
						<svg
							className='mr-2'
							width='22'
							height='22'
							fill='none'
							viewBox='0 0 24 24'
						>
							<rect
								x='4'
								y='5'
								width='16'
								height='14'
								rx='2'
								stroke='currentColor'
								strokeWidth='2'
							/>
							<path
								d='M8 3v4M16 3v4'
								stroke='currentColor'
								strokeWidth='2'
								strokeLinecap='round'
							/>
						</svg>
						View Work History
					</Link>
					<Link
						href='/dashboard/bus-timing'
						className='inline-flex items-center justify-center w-full px-6 py-4 bg-primary-600 dark:bg-primary-700 text-primary-900 dark:text-primary-50 rounded-xl shadow-lg text-lg font-semibold transition-all duration-200 hover:bg-primary-700 dark:hover:bg-primary-800 active:bg-primary-800 dark:active:bg-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2'
						style={{ minHeight: 56 }}
					>
						<svg
							className='mr-2'
							width='24'
							height='24'
							fill='none'
							viewBox='0 0 24 24'
						>
							<path
								d='M4 16V7a3 3 0 013-3h10a3 3 0 013 3v9a3 3 0 01-3 3H7a3 3 0 01-3-3z'
								stroke='currentColor'
								strokeWidth='2'
							/>
							<circle
								cx='8.5'
								cy='17.5'
								r='1.5'
								fill='currentColor'
							/>
							<circle
								cx='15.5'
								cy='17.5'
								r='1.5'
								fill='currentColor'
							/>
						</svg>
						View Bus Timings
					</Link>
				</div>
			</div>
		</div>
	);
}
