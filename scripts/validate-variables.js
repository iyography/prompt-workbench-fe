#!/usr/bin/env node

// Validate variable generation end-to-end
// Usage:
//   node scripts/validate-variables.js --company-id=5181133 --profile-url="https://www.linkedin.com/in/USERNAME" --fe-url=http://localhost:3001 --be-url=http://localhost:8000

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...rest] = a.replace(/^--/, '').split('=');
  return [k, rest.join('=') || true];
}));

const FE_URL = args['fe-url'] || process.env.FE_URL || 'http://localhost:3000';
const BE_URL = args['be-url'] || process.env.BE_URL || 'http://localhost:8000';
const COMPANY_ID = args['company-id'] || process.env.COMPANY_ID;
const PROFILE_URL = args['profile-url'] || process.env.PROFILE_URL;
const MAX_POSTS = Number(args['max-posts'] || 5);
const MAX_JOBS = Number(args['max-jobs'] || 5);

const axios = require('axios');

if (!COMPANY_ID) {
  console.error('Missing --company-id');
  process.exit(2);
}
if (!PROFILE_URL) {
  console.error('Missing --profile-url');
  process.exit(2);
}

function toSnakeCase(input) {
  return String(input)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}
function valueToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const primitives = value.every(v => ['string','number','boolean'].includes(typeof v));
    return primitives ? value.join(', ') : value.map(v => JSON.stringify(v)).join(' | ');
  }
  try { return JSON.stringify(value); } catch { return String(value); }
}
function flattenObject(obj, prefix = 'company') {
  const out = {};
  const recurse = (current, currentPrefix) => {
    if (current === null || current === undefined) return;
    if (typeof current !== 'object' || Array.isArray(current)) {
      out[currentPrefix] = valueToString(current);
      return;
    }
    for (const [k, v] of Object.entries(current)) {
      const nextKey = `${currentPrefix}_${toSnakeCase(k)}`;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        recurse(v, nextKey);
      } else {
        out[nextKey] = valueToString(v);
      }
    }
  };
  recurse(obj, prefix);
  return out;
}

async function fetchJSON(url, opts) {
  try {
    const method = (opts && opts.method) ? opts.method : 'GET';
    const headers = (opts && opts.headers) ? opts.headers : {};
    const data = (opts && opts.body) ? JSON.parse(opts.body) : undefined;
    const res = await axios.request({ url, method, headers, data, validateStatus: () => true });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}\n${typeof res.data === 'string' ? res.data : JSON.stringify(res.data).slice(0, 1000)}`);
    }
    return res.data;
  } catch (e) {
    throw new Error((e && e.message) || 'fetch failed');
  }
}

async function main() {
  console.log(`FE_URL=${FE_URL} BE_URL=${BE_URL} COMPANY_ID=${COMPANY_ID}`);

  // 1) Company Enrichment (backend)
  const enrichment = await fetchJSON(`${BE_URL}/api/company-enrichment/?company_id=${encodeURIComponent(COMPANY_ID)}`);
  const rawCompany = enrichment?.data || {};
  const convenience = {
    company_name: valueToString(rawCompany.company_name || rawCompany.name || ''),
    company_industry: valueToString(rawCompany.company_industry || rawCompany.industry || ''),
    company_size: valueToString(rawCompany.company_size || rawCompany.company_size_range || rawCompany.size || ''),
    company_location: valueToString(rawCompany.company_hq_full_address || rawCompany.location || rawCompany.headquarters || ''),
    company_website: valueToString(rawCompany.company_website || rawCompany.website || ''),
    company_job_postings: valueToString(rawCompany.active_job_postings_count ?? ''),
    company_description: valueToString(rawCompany.company_description || rawCompany.description || ''),
  };
  const companyVars = { ...flattenObject(rawCompany, 'company'), ...convenience };

  // 2) Posts (FE API)
  const postsResp = await fetchJSON(`${FE_URL}/api/apify/posts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileUrl: PROFILE_URL, maxPosts: MAX_POSTS })
  });
  const posts = Array.isArray(postsResp?.data) ? postsResp.data : [];
  const postsVars = {};
  const allPosts = [];
  const postsCount = Math.min(MAX_POSTS, posts.length);
  postsVars['linkedin_posts_count'] = String(postsCount);
  postsVars['linkedin_posts_profile'] = PROFILE_URL;
  for (let i = 0; i < postsCount; i++) {
    const post = posts[i] || {};
    const idx = i + 1;
    const likes = post?.stats?.like ?? 0;
    const comments = post?.stats?.comments ?? 0;
    const shares = post?.stats?.reposts ?? 0;
    const date = post?.posted_at?.date ? (() => { try { return new Date(post.posted_at.date).toLocaleDateString(); } catch { return ''; } })() : '';
    postsVars[`linkedin_posts_${idx}_text`] = post.text || '';
    postsVars[`linkedin_posts_${idx}_url`] = post.url || '';
    postsVars[`linkedin_posts_${idx}_date`] = date;
    postsVars[`linkedin_posts_${idx}_likes`] = String(likes);
    postsVars[`linkedin_posts_${idx}_comments`] = String(comments);
    postsVars[`linkedin_posts_${idx}_shares`] = String(shares);
    if (post.text) allPosts.push(post.text);
  }
  if (postsCount > 0) {
    postsVars[`linkedin_posts_latest_text`] = postsVars[`linkedin_posts_1_text`];
    postsVars[`linkedin_posts_latest_url`] = postsVars[`linkedin_posts_1_url`];
    postsVars[`linkedin_posts_latest_date`] = postsVars[`linkedin_posts_1_date`];
  }
  postsVars['all_user_posts'] = allPosts.join('\n\n');

  // 3) Jobs (FE API) - use company name if present
  const companyName = convenience.company_name || 'Unknown';
  const jobsResp = await fetchJSON(`${FE_URL}/api/apify/jobs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchQuery: companyName, location: 'United States' })
  });
  const jobs = Array.isArray(jobsResp?.data) ? jobsResp.data : [];
  const jobsVars = {};
  const titles = [];
  const titleDetails = [];
  const postingsAll = [];
  const jobsCount = Math.min(MAX_JOBS, jobs.length);
  jobsVars['linkedin_jobs_count'] = String(jobsCount);
  jobsVars['linkedin_jobs_company'] = companyName;
  jobsVars['linkedin_jobs_search_query'] = companyName;
  for (let i = 0; i < jobsCount; i++) {
    const job = jobs[i] || {};
    const idx = i + 1;
    jobsVars[`linkedin_jobs_${idx}_title`] = job.title || '';
    jobsVars[`linkedin_jobs_${idx}_company`] = job?.company?.name || job?.company || '';
    jobsVars[`linkedin_jobs_${idx}_location`] = job?.location?.linkedinText || job?.location?.parsed?.text || job?.location || '';
    jobsVars[`linkedin_jobs_${idx}_url`] = job?.linkedinUrl || job?.url || '';
    jobsVars[`linkedin_jobs_${idx}_posted_date`] = job?.postedDate ? new Date(job.postedDate).toLocaleDateString() : '';
    jobsVars[`linkedin_jobs_${idx}_employment_type`] = job?.employmentType || '';
    jobsVars[`linkedin_jobs_${idx}_experience_level`] = job?.experienceLevel || '';
    jobsVars[`linkedin_jobs_${idx}_description`] = job?.description || '';
    if (job.title) titles.push(job.title);
    const detail = `${job.title || ''}${job?.description ? ' - ' + job.description : ''}`.trim();
    if (detail) titleDetails.push(detail);
    const posting = [
      `Title: ${job.title || ''}`,
      `Company: ${job?.company?.name || job?.company || ''}`,
      `Location: ${job?.location?.linkedinText || job?.location?.parsed?.text || job?.location || ''}`,
      `URL: ${job?.linkedinUrl || job?.url || ''}`,
      `Description: ${job?.description || ''}`
    ].join('\n');
    postingsAll.push(posting.trim());
  }
  if (jobsCount > 0) {
    jobsVars[`linkedin_jobs_latest_title`] = jobsVars[`linkedin_jobs_1_title`];
    jobsVars[`linkedin_jobs_latest_company`] = jobsVars[`linkedin_jobs_1_company`];
    jobsVars[`linkedin_jobs_latest_location`] = jobsVars[`linkedin_jobs_1_location`];
    jobsVars[`linkedin_jobs_latest_url`] = jobsVars[`linkedin_jobs_1_url`];
  }
  jobsVars['all_job_titles'] = titles.join('\n');
  jobsVars['all_job_title_details'] = titleDetails.join('\n\n');
  jobsVars['job_postings_all'] = postingsAll.join('\n\n');

  // 4) Build alias variables like Execute page
  const aliasVars = {};
  const source = { ...companyVars, ...postsVars, ...jobsVars };
  for (const [key, value] of Object.entries(source)) {
    if (!value) continue;
    if (key.startsWith('company_')) {
      const unprefixed = key.slice('company_'.length);
      if (!(unprefixed in source)) aliasVars[unprefixed] = String(value);
    }
  }
  if (source['company_description']) aliasVars['description'] = String(source['company_description']);
  if (source['company_website']) aliasVars['website'] = String(source['company_website']);
  if (source['company_employees_count_change_yearly_percentage'] || source['employees_count_change_yearly_percentage']) {
    aliasVars['employees_count_change'] = String(source['company_employees_count_change_yearly_percentage'] || source['employees_count_change_yearly_percentage']);
  }
  if (!('active_job_postings_count_change' in source)) aliasVars['active_job_postings_count_change'] = '';

  // 5) Validate
  const allVars = { ...source, ...aliasVars };
  const missingAliases = [];
  for (const key of Object.keys(source)) {
    if (key.startsWith('company_')) {
      const unprefixed = key.slice('company_'.length);
      if (!(unprefixed in allVars)) missingAliases.push(`${key} -> ${unprefixed}`);
    }
  }
  const required = [
    'description','website','employees_count_change','active_job_postings_count_change',
    'all_user_posts','all_job_titles','all_job_title_details','job_postings_all'
  ];
  const missingRequired = required.filter(k => !(k in allVars));

  console.log('Summary:');
  console.log(`- Company vars: ${Object.keys(companyVars).length}`);
  console.log(`- Posts vars: ${Object.keys(postsVars).length}`);
  console.log(`- Jobs vars: ${Object.keys(jobsVars).length}`);
  console.log(`- Alias vars: ${Object.keys(aliasVars).length}`);
  if (missingAliases.length) {
    console.log('\nMissing unprefixed aliases for:');
    missingAliases.slice(0, 50).forEach(m => console.log('  -', m));
    if (missingAliases.length > 50) console.log(`  ... and ${missingAliases.length - 50} more`);
  }
  if (missingRequired.length) {
    console.log('\nMissing required variables:');
    missingRequired.forEach(k => console.log('  -', k));
  }

  if (missingAliases.length || missingRequired.length) {
    process.exit(1);
  } else {
    console.log('\n✅ All variables and aliases validated.');
  }
}

main().catch(err => {
  console.error('Validation failed:', err.message);
  process.exit(1);
}); 