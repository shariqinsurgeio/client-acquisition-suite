import { PenTool, Send } from "lucide-react";

export const Workbench = () => {
    return (
        <div className="h-full flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                    <PenTool className="w-4 h-4" /> Proposal Workbench
                </h2>
            </div>
            <div className="flex-1 p-6 flex flex-col gap-4">
                <div className="p-4 bg-gray-50 rounded border border-gray-100 text-sm text-gray-500 italic">
                    Select a job from the feed to start drafting a proposal...
                </div>

                <div className="flex-1 flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">Draft Proposal</label>
                    <textarea
                        className="flex-1 w-full p-3 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                        placeholder="Hi there, I noticed your job posting..."
                    ></textarea>
                </div>

                <div className="flex justify-end pt-2">
                    <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-medium transition-colors">
                        <Send className="w-4 h-4" /> Send Proposal
                    </button>
                </div>
            </div>
        </div>
    );
};
