'use client';
import { useEffect, useState } from 'react';
import { db } from '../../../firebase';
import {
	collection,
	query,
	where,
	orderBy,
	getDocs,
	Timestamp,
} from 'firebase/firestore';
import { auth } from '../../../firebase';
import Link from 'next/link';
import { doc, deleteDoc } from 'firebase/firestore';

function formatDuration(ms: number) {
	const h = Math.floor(ms / 3600000);
	const m = Math.floor((ms % 3600000) / 60000);
	return `${h ? h + 'h ' : ''}${m}m`;
}

export default function History() {
	const [entries, setEntries] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [period, setPeriod] = useState<'week' | 'month' | 'year'>('week');
	const [total, setTotal] = useState(0);
	const [user, setUser] = useState<any>(null);
	const [selected, setSelected] = useState<string[]>([]);
	const [busTimes, setBusTimes] = useState<{ id: string; time: string }[]>(
		[],
	);

	useEffect(() => {
		const unsub = auth.onAuthStateChanged(u => setUser(u));
		return () => unsub();
	}, []);

	useEffect(() => {
		if (!user) return;
		(async () => {
			let start = new Date();
			start.setHours(0, 0, 0, 0);
			if (period === 'week')
				start.setDate(start.getDate() - start.getDay());
			if (period === 'month') start.setDate(1);
			if (period === 'year') start = new Date(start.getFullYear(), 0, 1);
			const q = query(
				collection(db, 'entries'),
				where('userId', '==', user.uid),
				where('swapIn', '>=', Timestamp.fromDate(start)),
				orderBy('swapIn', 'desc'),
			);
			const snap = await getDocs(q);
			const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
			setEntries(data);
			setLoading(false);
			let sum = 0;
			data.forEach(e => {
				if (e.swapIn && e.swapOut) {
					sum +=
						e.swapOut.toDate().getTime() -
						e.swapIn.toDate().getTime();
				}
			});
			setTotal(sum);
		})();
	}, [user, period]);

	useEffect(() => {
		if (!user) return;
		const fetchBusTimes = async () => {
			const colRef = collection(db, 'users', user.uid, 'busTimes');
			const snap = await getDocs(colRef);
			if (snap.empty) {
				setBusTimes([]);
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

	const handleDelete = async (ids: string | string[]) => {
		const idList = Array.isArray(ids) ? ids : [ids];
		setEntries(prev => prev.filter(e => !idList.includes(e.id)));
		setSelected([]);
		try {
			await Promise.all(
				idList.map(id => deleteDoc(doc(db, 'entries', id))),
			);
		} catch (err) {
			// Optionally show error toast
		}
	};

	return (
		<div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-100 p-4 flex flex-col items-center'>
			<div className='w-full max-w-2xl bg-white/90 shadow-xl rounded-2xl px-8 py-10 mt-8 border border-gray-100'>
				<div className='flex justify-between items-center mb-6'>
					<h2 className='text-2xl font-bold text-gray-800'>
						Work History
					</h2>
					<Link
						href='/dashboard'
						className='text-blue-600 hover:underline'
					>
						Back to Dashboard
					</Link>
				</div>
				<div className='flex gap-2 mb-4'>
					<button
						onClick={() => setPeriod('week')}
						className={`px-3 py-1 rounded-full text-sm font-medium ${
							period === 'week'
								? 'bg-blue-500 text-white'
								: 'bg-gray-100 text-gray-700'
						}`}
					>
						This Week
					</button>
					<button
						onClick={() => setPeriod('month')}
						className={`px-3 py-1 rounded-full text-sm font-medium ${
							period === 'month'
								? 'bg-blue-500 text-white'
								: 'bg-gray-100 text-gray-700'
						}`}
					>
						This Month
					</button>
					<button
						onClick={() => setPeriod('year')}
						className={`px-3 py-1 rounded-full text-sm font-medium ${
							period === 'year'
								? 'bg-blue-500 text-white'
								: 'bg-gray-100 text-gray-700'
						}`}
					>
						This Year
					</button>
				</div>
				<div className='overflow-x-auto'>
					<table className='min-w-full border-separate border-spacing-y-0 shadow-lg rounded-xl overflow-hidden bg-white'>
						<thead>
							<tr className='bg-gray-50 text-gray-700 text-xs uppercase tracking-wider'>
								<th className='px-4 py-3 text-left rounded-tl-lg'>
									<input
										type='checkbox'
										checked={
											selected.length ===
												entries.length &&
											entries.length > 0
										}
										onChange={e => {
											if (e.target.checked)
												setSelected(
													entries.map(e => e.id),
												);
											else setSelected([]);
										}}
										className='accent-blue-500 h-4 w-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-400'
										aria-label='Select all rows'
									/>
								</th>
								<th className='px-4 py-3 text-left'>Date</th>
								<th className='px-4 py-3 text-left'>Swap In</th>
								<th className='px-4 py-3 text-left'>
									Swap Out
								</th>
								<th className='px-4 py-3 text-left'>
									Duration
								</th>
								<th className='px-4 py-3 text-right rounded-tr-lg'>
									Action
								</th>
							</tr>
						</thead>
						<tbody>
							{loading ? (
								<tr>
									<td
										colSpan={6}
										className='text-center py-8'
									>
										Loading...
									</td>
								</tr>
							) : entries.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className='text-center py-8 text-gray-400'
									>
										No entries found.
									</td>
								</tr>
							) : (
								entries.map(e => (
									<tr
										key={e.id}
										className={`transition hover:scale-[1.01] hover:shadow-lg bg-white border-b border-gray-200 last:border-b-0 group ${
											selected.includes(e.id)
												? 'bg-blue-50'
												: ''
										}`}
									>
										<td className='px-4 py-3'>
											<input
												type='checkbox'
												checked={selected.includes(
													e.id,
												)}
												onChange={ev => {
													if (ev.target.checked)
														setSelected(prev => [
															...prev,
															e.id,
														]);
													else
														setSelected(prev =>
															prev.filter(
																id =>
																	id !== e.id,
															),
														);
												}}
												className='accent-blue-500 h-4 w-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-400'
												aria-label='Select row'
											/>
										</td>
										<td className='px-4 py-3 rounded-l-lg font-semibold text-gray-700 whitespace-nowrap'>
											{e.swapIn &&
												e.swapIn
													.toDate()
													.toLocaleDateString()}
										</td>
										<td className='px-4 py-3 font-mono text-blue-700 whitespace-nowrap'>
											{e.swapIn &&
												e.swapIn
													.toDate()
													.toLocaleTimeString()}
										</td>
										<td className='px-4 py-3 font-mono text-blue-700 whitespace-nowrap'>
											{e.swapOut ? (
												e.swapOut
													.toDate()
													.toLocaleTimeString()
											) : (
												<span className='text-gray-400'>
													-
												</span>
											)}
										</td>
										<td className='px-4 py-3 font-mono text-green-700 whitespace-nowrap'>
											{e.swapIn && e.swapOut
												? formatDuration(
														e.swapOut
															.toDate()
															.getTime() -
															e.swapIn
																.toDate()
																.getTime(),
												  )
												: '-'}
										</td>
										<td className='px-4 py-3 rounded-r-lg text-right'>
											<button
												onClick={() =>
													handleDelete(e.id)
												}
												className='inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 hover:text-red-800 transition group-hover:opacity-100 opacity-60 focus:outline-none focus:ring-2 focus:ring-red-300'
												title='Delete entry'
											>
												<svg
													xmlns='http://www.w3.org/2000/svg'
													className='h-4 w-4'
													fill='none'
													viewBox='0 0 24 24'
													stroke='currentColor'
												>
													<path
														strokeLinecap='round'
														strokeLinejoin='round'
														strokeWidth={2}
														d='M6 18L18 6M6 6l12 12'
													/>
												</svg>
												Delete
											</button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
				<div className='mt-6 text-right text-lg font-semibold text-gray-700'>
					Total:{' '}
					<span className='text-blue-700'>
						{formatDuration(total)}
					</span>
				</div>
				{selected.length > 0 && (
					<div className='flex justify-end mt-2'>
						<button
							onClick={() => handleDelete(selected)}
							className='inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded shadow hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 transition'
						>
							<svg
								xmlns='http://www.w3.org/2000/svg'
								className='h-5 w-5'
								fill='none'
								viewBox='0 0 24 24'
								stroke='currentColor'
							>
								<path
									strokeLinecap='round'
									strokeLinejoin='round'
									strokeWidth={2}
									d='M6 18L18 6M6 6l12 12'
								/>
							</svg>
							Delete Selected ({selected.length})
						</button>
					</div>
				)}
				{busTimes.length > 0 && (
					<div className='mt-10'>
						<h3 className='text-lg font-bold mb-2 text-gray-800'>
							Bus Timings Lookup
						</h3>
						<table className='min-w-full border-separate border-spacing-y-0 shadow rounded-xl overflow-hidden bg-white'>
							<thead>
								<tr className='bg-gray-50 text-gray-700 text-xs uppercase tracking-wider'>
									<th className='px-4 py-3 text-left rounded-tl-lg'>
										Time
									</th>
								</tr>
							</thead>
							<tbody>
								{busTimes.map(b => (
									<tr
										key={b.id}
										className='transition hover:bg-blue-50 group'
									>
										<td className='px-4 py-3 font-mono text-blue-700 whitespace-nowrap'>
											{b.time}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
