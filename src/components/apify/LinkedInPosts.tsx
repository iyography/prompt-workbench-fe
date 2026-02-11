import React, { useEffect } from 'react';
import { useLinkedInPosts, LinkedInPost } from '../../hooks/useApify';
import { DictionaryTable } from '../common/DictionaryTable';

interface LinkedInPostsProps {
    profileUrl: string;
    maxPosts?: number;
    enabled?: boolean;
    onDataUpdate?: (data: Record<string, string>) => void;
}

export const LinkedInPosts: React.FC<LinkedInPostsProps> = ({
    profileUrl,
    maxPosts = 5,
    enabled = true,
    onDataUpdate
}) => {
    const {
        data,
        isLoading,
        error,
        refetch
    } = useLinkedInPosts(profileUrl, maxPosts, { enabled });

    // Update parent component with posts data for plays
    useEffect(() => {
        if (onDataUpdate && data?.data) {
            const count = Math.min(maxPosts, data.data.length);
            const vars: Record<string, string> = {
                linkedin_posts_count: count.toString(),
                linkedin_posts_profile: profileUrl
            };
            const allPosts: string[] = [];
            for (let i = 0; i < count; i++) {
                const post = data.data[i];
                const idx = i + 1;
                const likes = post.stats?.like ?? 0;
                const comments = post.stats?.comments ?? 0;
                const shares = post.stats?.reposts ?? 0;
                const date = post.posted_at?.date ? (() => { try { return new Date(post.posted_at.date).toLocaleDateString(); } catch { return ''; } })() : '';
                vars[`linkedin_posts_${idx}_text`] = post.text || '';
                vars[`linkedin_posts_${idx}_url`] = post.url || '';
                vars[`linkedin_posts_${idx}_date`] = date;
                vars[`linkedin_posts_${idx}_likes`] = String(likes);
                vars[`linkedin_posts_${idx}_comments`] = String(comments);
                vars[`linkedin_posts_${idx}_shares`] = String(shares);
                if (post.text) allPosts.push(post.text);
            }
            if (count > 0) {
                vars[`linkedin_posts_latest_text`] = vars[`linkedin_posts_1_text`];
                vars[`linkedin_posts_latest_url`] = vars[`linkedin_posts_1_url`];
                vars[`linkedin_posts_latest_date`] = vars[`linkedin_posts_1_date`];
            }
            // Aggregated variable for all user posts (texts)
            vars["all_user_posts"] = allPosts.join("\n\n");
            onDataUpdate(vars);
        }
    }, [data, onDataUpdate, profileUrl, maxPosts]);

    if (!enabled || !profileUrl) return null;

    if (isLoading) {
        return (
            <details className="mt-4">
                <summary className="cursor-pointer font-medium">
                    📝 LinkedIn Posts (Loading...)
                </summary>
                <div className="mt-2">
                    <div className="animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                </div>
            </details>
        );
    }

    if (error) {
        return (
            <details className="mt-4">
                <summary className="cursor-pointer font-medium text-red-600">
                    📝 LinkedIn Posts (Error)
                </summary>
                <div className="mt-2">
                    <p className="text-red-600">{error.message}</p>
                    <button 
                        onClick={() => refetch()}
                        className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
                    >
                        Retry
                    </button>
                </div>
            </details>
        );
    }

    if (!data?.data || data.data.length === 0) {
        return (
            <details className="mt-4">
                <summary className="cursor-pointer font-medium text-yellow-600">
                    📝 LinkedIn Posts (No posts found)
                </summary>
                <div className="mt-2">
                    <p className="text-yellow-600">No posts found for this profile</p>
                </div>
            </details>
        );
    }

    // Convert posts data to table format
    const postsTableData = (() => {
        const count = Math.min(maxPosts, data.data.length);
        const vars: Record<string, string> = {
            linkedin_posts_count: count.toString(),
            linkedin_posts_profile: profileUrl
        };
        const allPosts: string[] = [];
        for (let i = 0; i < count; i++) {
            const post = data.data[i] as LinkedInPost;
            const idx = i + 1;
            const likes = post.stats?.like ?? 0;
            const comments = post.stats?.comments ?? 0;
            const shares = post.stats?.reposts ?? 0;
            const date = post.posted_at?.date ? (() => { try { return new Date(post.posted_at.date).toLocaleDateString(); } catch { return ''; } })() : '';
            vars[`linkedin_posts_${idx}_text`] = post.text || '';
            vars[`linkedin_posts_${idx}_url`] = post.url || '';
            vars[`linkedin_posts_${idx}_date`] = date;
            vars[`linkedin_posts_${idx}_likes`] = String(likes);
            vars[`linkedin_posts_${idx}_comments`] = String(comments);
            vars[`linkedin_posts_${idx}_shares`] = String(shares);
            if (post.text) allPosts.push(post.text);
                }
        if (count > 0) {
            vars[`linkedin_posts_latest_text`] = vars[`linkedin_posts_1_text`];
            vars[`linkedin_posts_latest_url`] = vars[`linkedin_posts_1_url`];
            vars[`linkedin_posts_latest_date`] = vars[`linkedin_posts_1_date`];
        }
        vars["all_user_posts"] = allPosts.join("\n\n");
        return vars;
    })();

    return (
        <details className="mt-4">
            <summary className="cursor-pointer font-medium">
                📝 LinkedIn Posts ({data.data.length} found)
            </summary>
            <div className="mt-2">
                <DictionaryTable data={postsTableData} />
                {data.data.length > maxPosts && (
                    <p className="text-xs text-gray-500 mt-2">
                        Showing first {maxPosts} of {data.data.length} posts
                    </p>
                )}
            </div>
        </details>
    );
}; 