type WaitingScreenProps = {
    roomId: string;
    cancelWaiting: () => void;
};

export const WaitingScreen = ({ roomId, cancelWaiting }: WaitingScreenProps) => {
    return (
        <div className="text-center h-full flex flex-col items-center justify-center space-y-10">
            <div className="animate-spin h-20 w-20 border-8 border-[#5B46F5] border-t-transparent rounded-full"></div>
            <div>
                <p className="text-3xl font-bold text-gray-700">対戦相手を待機中...</p>
                <p className="text-lg text-gray-400 mt-2">Room: {roomId}</p>
            </div>
            <button
                onClick={cancelWaiting}
                className="inline-block px-8 py-3 text-gray-500 font-bold hover:text-white hover:bg-gray-400 rounded-full border-2 border-gray-300 transition cursor-pointer z-50 pointer-events-auto"
            >
                キャンセル
            </button>
        </div>
    );
};
