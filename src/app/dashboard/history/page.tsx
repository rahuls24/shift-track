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
import type { User } from 'firebase/auth';
import type { Timestamp as FirestoreTimestamp } from 'firebase/firestore';

const WORK_DURATION_MS = 3 * 60 * 60 * 1000 + 40 * 60 * 1000; // 3h 40m

function formatDuration(ms: number) {
	const mins = Math.round(ms / 60000);
	const hrs = (ms / 3600000).toFixed(2);
	return `${mins} min (${hrs}h)`;
}

type Entry = {
	id: string;
	swapIn?: FirestoreTimestamp;
	swapOut?: FirestoreTimestamp;
};

export default function History() {
	const [entries, setEntries] = useState<Entry[]>([]);
	const [loading, setLoading] = useState(true);
	const [period, setPeriod] = useState<'week' | 'month' | 'year'>('week');
	const [total, setTotal] = useState(0);
	const [user, setUser] = useState<User | null>(null);
	const [selected, setSelected] = useState<string[]>([]);

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
			const data = snap.docs.map(
				doc => ({ id: doc.id, ...doc.data() } as Entry),
			);
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

	const handleDelete = async (ids: string | string[]) => {
		const idList = Array.isArray(ids) ? ids : [ids];
		setEntries(prev => prev.filter(e => !idList.includes(e.id)));
		setSelected([]);
		try {
			await Promise.all(
				idList.map(id => deleteDoc(doc(db, 'entries', id))),
			);
		} catch {
			// Optionally show error toast
		}
	};

	return (
		<div className='min-h-screen bg-gradient-to-br from-blue-50 to-green-100 p-2 sm:p-4 flex flex-col items-center'>
			<div className='w-full max-w-2xl bg-white/90 shadow-xl rounded-2xl px-2 py-6 sm:px-8 sm:py-10 mt-4 sm:mt-8 border border-gray-100'>
				<div className='flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-2 sm:gap-0'>
					<h2 className='text-xl sm:text-2xl font-bold text-gray-800 text-center sm:text-left'>
						Work History
					</h2>
					<Link
						href='/dashboard'
						className='text-blue-600 hover:underline text-center sm:text-right text-base sm:text-base'
					>
						Back to Dashboard
					</Link>
				</div>
				<div className='flex flex-wrap gap-2 mb-4 justify-center sm:justify-start'>
					<button
						onClick={() => setPeriod('week')}
						className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
							period === 'week'
								? 'bg-blue-500 text-white'
								: 'bg-gray-100 text-gray-700'
						}`}
					>
						This Week
					</button>
					<button
						onClick={() => setPeriod('month')}
						className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
							period === 'month'
								? 'bg-blue-500 text-white'
								: 'bg-gray-100 text-gray-700'
						}`}
					>
						This Month
					</button>
					<button
						onClick={() => setPeriod('year')}
						className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
							period === 'year'
								? 'bg-blue-500 text-white'
								: 'bg-gray-100 text-gray-700'
						}`}
					>
						This Year
					</button>
				</div>
				<div className='w-full overflow-x-auto rounded-lg border border-gray-200 bg-white mb-4'>
					<table className='min-w-[600px] w-full text-xs sm:text-sm border-separate border-spacing-y-0'>
						<thead>
							<tr className='bg-gray-50 text-gray-700 text-xs uppercase tracking-wider'>
								<th className='px-2 py-2 sm:px-4 sm:py-3 text-left rounded-tl-lg'>
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
								<th className='px-2 py-2 sm:px-4 sm:py-3 text-left'>
									Date
								</th>
								<th className='px-2 py-2 sm:px-4 sm:py-3 text-left'>
									Swap In
								</th>
								<th className='px-2 py-2 sm:px-4 sm:py-3 text-left'>
									Swap Out
								</th>
								<th className='px-2 py-2 sm:px-4 sm:py-3 text-left'>
									Duration
								</th>
								<th className='px-2 py-2 sm:px-4 sm:py-3 text-left'>
									Status
								</th>
								<th className='px-2 py-2 sm:px-4 sm:py-3 text-right rounded-tr-lg'>
									Action
								</th>
							</tr>
						</thead>
						<tbody>
							{loading ? (
								<tr>
									<td
										colSpan={7}
										className='text-center py-8'
									>
										Loading...
									</td>
								</tr>
							) : entries.length === 0 ? (
								<tr>
									<td
										colSpan={7}
										className='text-center py-8 text-gray-400'
									>
										No entries found.
									</td>
								</tr>
							) : (
								entries.map(e => {
									let durationMs = 0;
									let status = '-';
									if (e.swapIn && e.swapOut) {
										durationMs =
											e.swapOut.toDate().getTime() -
											e.swapIn.toDate().getTime();
										if (durationMs >= WORK_DURATION_MS) {
											status = 'Covered';
										} else {
											status = 'Ended Early';
										}
									}
									return (
										<tr
											key={e.id}
											className={`transition hover:scale-[1.01] hover:shadow-lg bg-white border-b border-gray-200 last:border-b-0 group ${
												selected.includes(e.id)
													? 'bg-blue-50'
													: ''
											}`}
										>
											<td className='px-2 py-2 sm:px-4 sm:py-3'>
												<input
													type='checkbox'
													checked={selected.includes(
														e.id,
													)}
													onChange={ev => {
														if (ev.target.checked)
															setSelected(
																prev => [
																	...prev,
																	e.id,
																],
															);
														else
															setSelected(prev =>
																prev.filter(
																	id =>
																		id !==
																		e.id,
																),
															);
													}}
													className='accent-blue-500 h-4 w-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-400'
													aria-label='Select row'
												/>
											</td>
											<td className='px-2 py-2 sm:px-4 sm:py-3 rounded-l-lg font-semibold text-gray-700 whitespace-nowrap'>
												{e.swapIn &&
													e.swapIn
														.toDate()
														.toLocaleDateString()}
											</td>
											<td className='px-2 py-2 sm:px-4 sm:py-3 font-mono text-blue-700 whitespace-nowrap'>
												{e.swapIn &&
													e.swapIn
														.toDate()
														.toLocaleTimeString()}
											</td>
											<td className='px-2 py-2 sm:px-4 sm:py-3 font-mono text-blue-700 whitespace-nowrap'>
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
											<td className='px-2 py-2 sm:px-4 sm:py-3 font-mono text-green-700 whitespace-nowrap'>
												{e.swapIn && e.swapOut
													? formatDuration(durationMs)
													: '-'}
											</td>
											<td
												className={`px-2 py-2 sm:px-4 sm:py-3 font-semibold whitespace-nowrap ${
													status === 'Covered'
														? 'text-green-600'
														: status ===
														  'Ended Early'
														? 'text-red-500'
														: 'text-gray-400'
												}`}
											>
												{status}
											</td>
											<td className='px-2 py-2 sm:px-4 sm:py-3 rounded-r-lg text-right'>
												<button
													onClick={() =>
														handleDelete(e.id)
													}
													className='inline-flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 hover:text-red-800 transition group-hover:opacity-100 opacity-60 focus:outline-none focus:ring-2 focus:ring-red-300'
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
													<span className='hidden xs:inline'>
														Delete
													</span>
												</button>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>
				<div className='mt-4 sm:mt-6 text-right text-base sm:text-lg font-semibold text-gray-700'>
					Total:{' '}
					<span className='text-blue-700'>
						{formatDuration(total)}
					</span>
				</div>
				{selected.length > 0 && (
					<div className='flex justify-end mt-2'>
						<button
							onClick={() => handleDelete(selected)}
							className='inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-semibold text-white bg-red-600 rounded shadow hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 transition'
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
			</div>
		</div>
	);
}
