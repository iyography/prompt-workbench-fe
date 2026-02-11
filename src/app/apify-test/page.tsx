'use client';

import { LinkedInJobs } from '../../components/apify/LinkedInJobs';
import { LinkedInPosts } from '../../components/apify/LinkedInPosts';

export default function ApifyTestPage() {
    return (
        <div className="container mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Apify Integration Test</h1>
            
            <div className="space-y-6">
                <div>
                    <h2 className="text-xl font-semibold mb-4">LinkedIn Jobs Test</h2>
                    <LinkedInJobs 
                        searchQuery="software engineer at Google"
                        location="United States"
                        jobType="full-time"
                        experienceLevel="mid-level"
                        enabled={true}
                    />
                </div>
                
                <div>
                    <h2 className="text-xl font-semibold mb-4">LinkedIn Jobs Test 2 (Company Only)</h2>
                    <LinkedInJobs 
                        searchQuery="Meta"
                        location="United States"
                        jobType="full-time"
                        experienceLevel="mid-level"
                        enabled={true}
                    />
                </div>
                
                <div>
                    <h2 className="text-xl font-semibold mb-4">LinkedIn Posts Test</h2>
                    <LinkedInPosts 
                        profileUrl="https://www.linkedin.com/in/brian-minick"
                        maxPosts={5}
                        enabled={true}
                    />
                </div>
            </div>
        </div>
    );
} 