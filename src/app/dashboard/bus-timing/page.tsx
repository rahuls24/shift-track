'use client';
import { useEffect, useState } from 'react';
import { db } from '../../../firebase';
import {
	collection,
	doc,
	setDoc,
	updateDoc,
	deleteDoc,
	onSnapshot,
} from 'firebase/firestore';
import { auth } from '../../../firebase';
import Link from 'next/link';

const DEFAULT_TIMES = [
	'17:15',
	'17:30',
	'18:10',
	'18:20',
	'18:20',
	'19:15',
	'19:45',
];

interface BusTime {
	id: string;
	time: string;
}

export default function BusTiming() {
	const [busTimes, setBusTimes] = useState<BusTime[]>([]);
	const [loading, setLoading] = useState(true);
	// eslint-disable-next-line
	const [user, setUser] = useState<any>(null);
	const [editId, setEditId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState('');
	const [newTime, setNewTime] = useState('');

	useEffect(() => {
		const unsub = auth.onAuthStateChanged(u => setUser(u));
		return () => unsub();
	}, []);

	useEffect(() => {
		if (!user) return;
		const colRef = collection(db, 'users', user.uid, 'busTimes');
		const unsub = onSnapshot(colRef, async snap => {
			if (snap.empty) {
				// Set default times for new user
				await Promise.all(
					DEFAULT_TIMES.map(t =>
						setDoc(doc(db, 'users', user.uid, 'busTimes', t), {
							time: t,
						}),
					),
				);
				setBusTimes(DEFAULT_TIMES.map(t => ({ id: t, time: t })));
				setLoading(false);
				return;
			}
			const data = snap.docs.map(
				d => ({ id: d.id, ...d.data() } as BusTime),
			);
			setBusTimes(data.sort((a, b) => a.time.localeCompare(b.time)));
			setLoading(false);
		});
		return () => unsub();
	}, [user]);

	const handleAdd = async () => {
		if (!newTime.match(/^\d{2}:\d{2}$/)) return;
		await setDoc(doc(db, 'users', user.uid, 'busTimes', newTime), {
			time: newTime,
		});
		setNewTime('');
	};

	const handleDelete = async (id: string) => {
		await deleteDoc(doc(db, 'users', user.uid, 'busTimes', id));
	};

	const handleEdit = async (id: string) => {
		if (!editValue.match(/^\d{2}:\d{2}$/)) return;
		await updateDoc(doc(db, 'users', user.uid, 'busTimes', id), {
			time: editValue,
		});
		setEditId(null);
		setEditValue('');
	};

	// Suggest next bus based on current time
	const now = new Date();
	const nowStr = now.toTimeString().slice(0, 5);
	const nextBus = busTimes.find(b => b.time > nowStr);

	// Suggest best bus based on end time (3h 40m from now)
	const sessionMinutes = 3 * 60 + 40;
	const end = new Date(now.getTime() + sessionMinutes * 60000);
	const endStr = end.toTimeString().slice(0, 5);
	const bestBus = busTimes.find(b => b.time >= endStr);

	return (
		<div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-100 p-4 flex flex-col items-center'>
			<div className='w-full max-w-xl bg-white/90 shadow-xl rounded-2xl px-8 py-10 mt-8 border border-gray-100'>
				<div className='flex justify-between items-center mb-6'>
					<h2 className='text-2xl font-bold text-gray-800'>
						Bus Timings
					</h2>
					<Link
						href='/dashboard'
						className='text-blue-600 hover:underline'
					>
						Back to Dashboard
					</Link>
				</div>
				<div className='mb-4 flex gap-2 items-center'>
					<input
						type='text'
						value={newTime}
						onChange={e => setNewTime(e.target.value)}
						placeholder='HH:MM'
						className='border px-3 py-2 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200'
						maxLength={5}
					/>
					<button
						onClick={handleAdd}
						className='px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold'
					>
						Add
					</button>
				</div>
				<table className='min-w-full border-separate border-spacing-y-0 shadow rounded-xl overflow-hidden bg-white'>
					<thead>
						<tr className='bg-gray-50 text-gray-700 text-xs uppercase tracking-wider'>
							<th className='px-4 py-3 text-left rounded-tl-lg'>
								Time
							</th>
							<th className='px-4 py-3 text-right rounded-tr-lg'>
								Action
							</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<tr>
								<td colSpan={2} className='text-center py-8'>
									Loading...
								</td>
							</tr>
						) : busTimes.length === 0 ? (
							<tr>
								<td
									colSpan={2}
									className='text-center py-8 text-gray-400'
								>
									No bus times set.
								</td>
							</tr>
						) : (
							busTimes.map(b => (
								<tr
									key={b.id}
									className='transition hover:bg-blue-50 group'
								>
									<td className='px-4 py-3 font-mono text-blue-700 whitespace-nowrap'>
										{editId === b.id ? (
											<input
												type='text'
												value={editValue}
												onChange={e =>
													setEditValue(e.target.value)
												}
												className='border px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-200'
												maxLength={5}
											/>
										) : (
											b.time
										)}
									</td>
									<td className='px-4 py-3 text-right'>
										{editId === b.id ? (
											<>
												<button
													onClick={() =>
														handleEdit(b.id)
													}
													className='px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 mr-2'
												>
													Save
												</button>
												<button
													onClick={() => {
														setEditId(null);
														setEditValue('');
													}}
													className='px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400'
												>
													Cancel
												</button>
											</>
										) : (
											<>
												<button
													onClick={() => {
														setEditId(b.id);
														setEditValue(b.time);
													}}
													className='px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 mr-2'
												>
													Edit
												</button>
												<button
													onClick={() =>
														handleDelete(b.id)
													}
													className='px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600'
												>
													Delete
												</button>
											</>
										)}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
				<div className='mt-6 text-lg font-semibold text-gray-700'>
					Next Bus:{' '}
					<span className='text-blue-700'>
						{nextBus ? nextBus.time : 'No more buses today'}
					</span>
				</div>
				<div className='mt-2 text-base font-medium text-green-700'>
					Best Bus After Session:{' '}
					<span className='text-green-900 font-bold'>
						{bestBus
							? bestBus.time
							: 'No suitable bus after your session'}
					</span>
				</div>
			</div>
		</div>
	);
}
