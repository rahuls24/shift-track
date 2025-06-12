import Dashboard from './dashboard/page';
import Link from 'next/link';

export default function Home() {
	return (
		<>
			<Dashboard />
			<div className='flex justify-center mt-8'>
				<Link
					href='/dashboard/bus-timing'
					className='inline-flex items-center justify-center w-full max-w-xs px-6 py-4 bg-blue-600 text-white rounded-xl shadow-lg text-lg font-semibold transition-all duration-200 hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2'
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
		</>
	);
}
