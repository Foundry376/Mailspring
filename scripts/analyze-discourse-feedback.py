#!/usr/bin/env python3
"""
Mailspring Community Discourse Feedback Analyzer

Fetches all posts from community.getmailspring.com and categorizes them
into topics for analysis.

Categories:
  - Sync issues (broken down by email provider and platform)
  - Authentication issues
  - UI bugs
  - OS integration issues (notifications, system tray, etc.)
  - Performance issues
  - Crashes
  - Feature requests
  - And more...

Environment Variables:
  DISCOURSE_API_KEY      - Required. Your Discourse API key
  DISCOURSE_API_USERNAME - Optional. API username (default: "system")

Usage:
    export DISCOURSE_API_KEY="your-api-key-here"
    python scripts/analyze-discourse-feedback.py [--output report.json]

Options:
    --output, -o       Output JSON file path (default: mailspring-feedback-report.json)
    --fetch-content    Fetch full post content for more accurate classification (slower)
    --max-pages        Maximum number of pages to fetch (default: 50)
"""

import argparse
import json
import os
import re
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Configuration
DISCOURSE_BASE_URL = "https://community.getmailspring.com"
API_KEY = os.environ.get("DISCOURSE_API_KEY", "")
API_USERNAME = os.environ.get("DISCOURSE_API_USERNAME", "system")

# Rate limiting
REQUEST_DELAY = 0.5  # seconds between requests


@dataclass
class Post:
    """Represents a Discourse post/topic"""
    id: int
    title: str
    category: str
    category_id: int
    created_at: str
    reply_count: int
    views: int
    like_count: int
    posts_count: int
    last_posted_at: str
    excerpt: str = ""
    tags: list = field(default_factory=list)
    raw_content: str = ""

    # Derived classifications
    email_provider: Optional[str] = None
    platform: Optional[str] = None
    issue_category: Optional[str] = None
    is_quick_fix: bool = False


class DiscourseAPI:
    """Client for Discourse API"""

    def __init__(self, base_url: str, api_key: str, api_username: str = "system"):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.api_username = api_username
        self.categories_cache = {}

    def _request(self, endpoint: str, params: dict = None, max_retries: int = 3) -> dict:
        """Make an API request with authentication and retry logic"""
        url = f"{self.base_url}/{endpoint}"
        if params:
            query = "&".join(f"{k}={v}" for k, v in params.items())
            url = f"{url}?{query}"

        headers = {
            "Api-Key": self.api_key,
            "Api-Username": self.api_username,
            "Accept": "application/json",
            "User-Agent": "Mailspring-Feedback-Analyzer/1.0"
        }

        req = Request(url, headers=headers)
        last_error = None

        for attempt in range(max_retries):
            try:
                with urlopen(req, timeout=30) as response:
                    return json.loads(response.read().decode("utf-8"))
            except HTTPError as e:
                last_error = e
                if e.code == 429:  # Rate limited
                    wait_time = 2 ** (attempt + 1)
                    print(f"  Rate limited, waiting {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                elif e.code >= 500:  # Server error, retry
                    wait_time = 2 ** attempt
                    print(f"  Server error {e.code}, retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"HTTP Error {e.code}: {e.reason} for {url}")
                    raise
            except URLError as e:
                last_error = e
                wait_time = 2 ** attempt
                print(f"  Network error, retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue

        # All retries exhausted
        if last_error:
            print(f"Failed after {max_retries} attempts: {last_error}")
            raise last_error

    def get_categories(self) -> dict:
        """Fetch all categories"""
        if self.categories_cache:
            return self.categories_cache

        data = self._request("categories.json")
        categories = {}
        for cat in data.get("category_list", {}).get("categories", []):
            categories[cat["id"]] = cat["name"]
            # Also get subcategories
            for subcat in cat.get("subcategory_list", []):
                categories[subcat["id"]] = f"{cat['name']} > {subcat['name']}"

        self.categories_cache = categories
        return categories

    def get_latest_topics(self, page: int = 0) -> list:
        """Fetch latest topics with pagination"""
        data = self._request("latest.json", {"page": page})
        return data.get("topic_list", {}).get("topics", [])

    def get_category_topics(self, category_slug: str, category_id: int, page: int = 0) -> list:
        """Fetch topics from a specific category"""
        data = self._request(f"c/{category_slug}/{category_id}.json", {"page": page})
        return data.get("topic_list", {}).get("topics", [])

    def get_topic_details(self, topic_id: int) -> dict:
        """Fetch full topic with posts"""
        return self._request(f"t/{topic_id}.json")

    def get_all_topics(self, max_pages: int = 50) -> list:
        """Fetch all topics across all pages"""
        all_topics = []
        page = 0

        while page < max_pages:
            print(f"  Fetching page {page + 1}...", end=" ", flush=True)
            topics = self.get_latest_topics(page)

            if not topics:
                print("no more topics")
                break

            all_topics.extend(topics)
            print(f"got {len(topics)} topics (total: {len(all_topics)})")

            page += 1
            time.sleep(REQUEST_DELAY)

        return all_topics


class FeedbackClassifier:
    """Classifies posts into categories"""

    # Email provider patterns
    EMAIL_PROVIDERS = {
        "gmail": [r"gmail", r"google\s*mail", r"g\s*suite", r"google\s*workspace"],
        "outlook": [r"outlook", r"hotmail", r"live\.com", r"msn\.com"],
        "office365": [r"office\s*365", r"o365", r"microsoft\s*365", r"m365"],
        "icloud": [r"icloud", r"apple\s*mail", r"@me\.com", r"@mac\.com"],
        "yahoo": [r"yahoo"],
        "protonmail": [r"proton", r"protonmail"],
        "fastmail": [r"fastmail"],
        "zoho": [r"zoho"],
        "exchange": [r"exchange", r"ews"],
        "imap_generic": [r"\bimap\b", r"\bsmtp\b"],
    }

    # Platform patterns
    PLATFORMS = {
        "windows": [r"windows", r"win\s*1[01]", r"win\s*7", r"win\s*8", r"\.exe\b"],
        "macos": [r"macos", r"mac\s*os", r"osx", r"os\s*x", r"darwin", r"macbook", r"imac"],
        "linux": [r"linux", r"ubuntu", r"debian", r"fedora", r"arch", r"manjaro",
                  r"mint", r"pop[_!]?os", r"elementary", r"kde", r"gnome", r"flatpak",
                  r"snap", r"appimage", r"\.deb\b", r"\.rpm\b"],
    }

    # Issue category patterns
    ISSUE_CATEGORIES = {
        "sync_issues": [
            r"sync", r"synchron", r"not\s*(?:receiving|getting)\s*(?:mail|email)",
            r"missing\s*(?:mail|email)", r"disconnect", r"reconnect", r"offline",
            r"out\s*of\s*sync", r"won't\s*sync", r"doesn't\s*sync"
        ],
        "authentication": [
            r"oauth", r"auth(?:entication)?", r"login", r"password", r"credential",
            r"sign\s*in", r"token", r"2fa", r"two.factor", r"mfa", r"xoauth"
        ],
        "ui_bugs": [
            r"ui\b", r"interface", r"display", r"theme", r"dark\s*mode", r"font",
            r"layout", r"window", r"resize", r"button", r"click", r"hover",
            r"white\s*screen", r"blank\s*screen", r"visual", r"render"
        ],
        "os_integration": [
            r"notification", r"tray", r"system\s*tray", r"dock", r"taskbar",
            r"default\s*(?:mail|email)", r"mailto", r"protocol\s*handler",
            r"autostart", r"startup", r"shortcut", r"keyboard", r"hotkey"
        ],
        "performance": [
            r"slow", r"lag", r"freeze", r"hang", r"cpu", r"memory", r"ram",
            r"battery", r"resource", r"performance", r"speed"
        ],
        "crash": [
            r"crash", r"segfault", r"core\s*dump", r"not\s*(?:starting|opening)",
            r"won't\s*(?:start|open|launch)", r"fails?\s*to\s*(?:start|open|launch)"
        ],
        "email_composition": [
            r"compose", r"draft", r"send(?:ing)?", r"reply", r"forward",
            r"attachment", r"signature", r"template", r"formatting", r"html\s*email"
        ],
        "search": [
            r"search", r"find", r"filter", r"query"
        ],
        "contacts": [
            r"contact", r"address\s*book", r"autocomplete", r"recipient"
        ],
        "calendar": [
            r"calendar", r"event", r"invite", r"rsvp", r"meeting", r"schedule"
        ],
        "feature_request": [
            r"feature\s*request", r"would\s*be\s*nice", r"please\s*add",
            r"suggestion", r"wish", r"enhancement"
        ],
    }

    # Quick fix indicators
    QUICK_FIX_PATTERNS = [
        r"(?:just|simply)\s*(?:need|want)\s*to",
        r"easy\s*fix",
        r"minor",
        r"small\s*(?:bug|issue)",
        r"typo",
        r"simple\s*(?:bug|issue|fix)",
    ]

    def __init__(self):
        # Pre-compile patterns for efficiency
        self._compile_patterns()

    def _compile_patterns(self):
        """Compile regex patterns"""
        self.email_patterns = {
            provider: [re.compile(p, re.IGNORECASE) for p in patterns]
            for provider, patterns in self.EMAIL_PROVIDERS.items()
        }
        self.platform_patterns = {
            platform: [re.compile(p, re.IGNORECASE) for p in patterns]
            for platform, patterns in self.PLATFORMS.items()
        }
        self.issue_patterns = {
            category: [re.compile(p, re.IGNORECASE) for p in patterns]
            for category, patterns in self.ISSUE_CATEGORIES.items()
        }
        self.quick_fix_patterns = [
            re.compile(p, re.IGNORECASE) for p in self.QUICK_FIX_PATTERNS
        ]

    def _match_any(self, text: str, patterns: list) -> bool:
        """Check if any pattern matches the text"""
        return any(p.search(text) for p in patterns)

    def detect_email_provider(self, text: str) -> Optional[str]:
        """Detect email provider mentioned in text"""
        for provider, patterns in self.email_patterns.items():
            if self._match_any(text, patterns):
                return provider
        return None

    def detect_platform(self, text: str) -> Optional[str]:
        """Detect platform mentioned in text"""
        for platform, patterns in self.platform_patterns.items():
            if self._match_any(text, patterns):
                return platform
        return None

    def detect_issue_category(self, text: str, discourse_category: str) -> str:
        """Detect issue category from text and discourse category"""
        # Use discourse category as hint
        category_lower = discourse_category.lower()
        if "sync" in category_lower:
            return "sync_issues"
        if "bug" in category_lower:
            # Still need to determine specific bug type
            pass
        if "feature" in category_lower or "request" in category_lower:
            return "feature_request"
        if "help" in category_lower:
            # Could be anything, need to analyze text
            pass

        # Score each category based on pattern matches
        scores = defaultdict(int)
        for category, patterns in self.issue_patterns.items():
            for pattern in patterns:
                if pattern.search(text):
                    scores[category] += 1

        if scores:
            return max(scores.keys(), key=lambda k: scores[k])

        return "other"

    def is_quick_fix(self, text: str) -> bool:
        """Check if this appears to be a quick/easy fix"""
        return any(p.search(text) for p in self.quick_fix_patterns)

    def classify(self, post: Post) -> Post:
        """Classify a post and update its fields"""
        # Combine title, excerpt, and content for analysis
        full_text = f"{post.title} {post.excerpt} {post.raw_content}"

        post.email_provider = self.detect_email_provider(full_text)
        post.platform = self.detect_platform(full_text)
        post.issue_category = self.detect_issue_category(full_text, post.category)
        post.is_quick_fix = self.is_quick_fix(full_text)

        return post


class FeedbackAnalyzer:
    """Main analyzer that orchestrates fetching and classification"""

    def __init__(self, api: DiscourseAPI, classifier: FeedbackClassifier):
        self.api = api
        self.classifier = classifier
        self.posts = []

    def fetch_all_posts(self, fetch_content: bool = False, max_pages: int = 50):
        """Fetch all posts from Discourse"""
        print("Fetching categories...")
        categories = self.api.get_categories()
        print(f"  Found {len(categories)} categories")

        print("\nFetching all topics...")
        topics = self.api.get_all_topics(max_pages=max_pages)
        print(f"\nTotal topics fetched: {len(topics)}")

        print("\nProcessing topics...")
        for i, topic in enumerate(topics):
            if (i + 1) % 50 == 0:
                print(f"  Processed {i + 1}/{len(topics)} topics...")

            category_name = categories.get(topic.get("category_id", 0), "Uncategorized")

            post = Post(
                id=topic["id"],
                title=topic.get("title", ""),
                category=category_name,
                category_id=topic.get("category_id", 0),
                created_at=topic.get("created_at", ""),
                reply_count=topic.get("reply_count", 0),
                views=topic.get("views", 0),
                like_count=topic.get("like_count", 0),
                posts_count=topic.get("posts_count", 0),
                last_posted_at=topic.get("last_posted_at", ""),
                excerpt=topic.get("excerpt", ""),
                tags=topic.get("tags", []),
            )

            # Optionally fetch full content (slower but more accurate)
            if fetch_content:
                try:
                    details = self.api.get_topic_details(topic["id"])
                    posts = details.get("post_stream", {}).get("posts", [])
                    if posts:
                        post.raw_content = posts[0].get("cooked", "")
                    time.sleep(REQUEST_DELAY)
                except Exception as e:
                    print(f"  Warning: Could not fetch details for topic {topic['id']}: {e}")

            # Classify the post
            self.classifier.classify(post)
            self.posts.append(post)

        print(f"  Processed all {len(topics)} topics")

    def generate_report(self) -> dict:
        """Generate a comprehensive report"""
        report = {
            "generated_at": datetime.now().isoformat(),
            "total_posts": len(self.posts),
            "summary": {},
            "by_issue_category": defaultdict(list),
            "by_email_provider": defaultdict(list),
            "by_platform": defaultdict(list),
            "sync_issues_breakdown": {
                "by_provider": defaultdict(list),
                "by_platform": defaultdict(list),
                "by_provider_and_platform": defaultdict(list),
            },
            "quick_fixes": [],
            "ui_bugs": [],
            "os_integration_issues": [],
            "top_issues_by_engagement": [],
            "all_posts": [],
        }

        # Process each post
        for post in self.posts:
            post_summary = {
                "id": post.id,
                "title": post.title,
                "url": f"{DISCOURSE_BASE_URL}/t/{post.id}",
                "category": post.category,
                "issue_category": post.issue_category,
                "email_provider": post.email_provider,
                "platform": post.platform,
                "is_quick_fix": post.is_quick_fix,
                "views": post.views,
                "reply_count": post.reply_count,
                "like_count": post.like_count,
                "created_at": post.created_at,
                "engagement_score": post.views + (post.reply_count * 10) + (post.like_count * 5),
            }

            report["all_posts"].append(post_summary)

            # Categorize
            if post.issue_category:
                report["by_issue_category"][post.issue_category].append(post_summary)

            if post.email_provider:
                report["by_email_provider"][post.email_provider].append(post_summary)

            if post.platform:
                report["by_platform"][post.platform].append(post_summary)

            # Sync issues breakdown
            if post.issue_category == "sync_issues":
                if post.email_provider:
                    report["sync_issues_breakdown"]["by_provider"][post.email_provider].append(post_summary)
                if post.platform:
                    report["sync_issues_breakdown"]["by_platform"][post.platform].append(post_summary)
                if post.email_provider and post.platform:
                    key = f"{post.email_provider}_{post.platform}"
                    report["sync_issues_breakdown"]["by_provider_and_platform"][key].append(post_summary)

            # Special categories
            if post.is_quick_fix:
                report["quick_fixes"].append(post_summary)

            if post.issue_category == "ui_bugs":
                report["ui_bugs"].append(post_summary)

            if post.issue_category == "os_integration":
                report["os_integration_issues"].append(post_summary)

        # Sort by engagement and get top issues
        all_sorted = sorted(report["all_posts"], key=lambda x: x["engagement_score"], reverse=True)
        report["top_issues_by_engagement"] = all_sorted[:50]

        # Generate summary statistics
        report["summary"] = {
            "total_posts": len(self.posts),
            "by_issue_category": {k: len(v) for k, v in report["by_issue_category"].items()},
            "by_email_provider": {k: len(v) for k, v in report["by_email_provider"].items()},
            "by_platform": {k: len(v) for k, v in report["by_platform"].items()},
            "sync_issues": {
                "total": len(report["by_issue_category"].get("sync_issues", [])),
                "by_provider": {k: len(v) for k, v in report["sync_issues_breakdown"]["by_provider"].items()},
                "by_platform": {k: len(v) for k, v in report["sync_issues_breakdown"]["by_platform"].items()},
            },
            "quick_fixes_count": len(report["quick_fixes"]),
            "ui_bugs_count": len(report["ui_bugs"]),
            "os_integration_count": len(report["os_integration_issues"]),
        }

        # Convert defaultdicts to regular dicts for JSON serialization
        report["by_issue_category"] = dict(report["by_issue_category"])
        report["by_email_provider"] = dict(report["by_email_provider"])
        report["by_platform"] = dict(report["by_platform"])
        report["sync_issues_breakdown"]["by_provider"] = dict(report["sync_issues_breakdown"]["by_provider"])
        report["sync_issues_breakdown"]["by_platform"] = dict(report["sync_issues_breakdown"]["by_platform"])
        report["sync_issues_breakdown"]["by_provider_and_platform"] = dict(
            report["sync_issues_breakdown"]["by_provider_and_platform"]
        )

        return report

    def print_summary(self, report: dict):
        """Print a human-readable summary"""
        summary = report["summary"]

        print("\n" + "=" * 70)
        print("MAILSPRING COMMUNITY FEEDBACK ANALYSIS")
        print("=" * 70)
        print(f"\nGenerated: {report['generated_at']}")
        print(f"Total Posts Analyzed: {summary['total_posts']}")

        print("\n" + "-" * 50)
        print("ISSUES BY CATEGORY")
        print("-" * 50)
        for category, count in sorted(summary["by_issue_category"].items(), key=lambda x: -x[1]):
            print(f"  {category:25} {count:5} posts")

        print("\n" + "-" * 50)
        print("ISSUES BY EMAIL PROVIDER")
        print("-" * 50)
        for provider, count in sorted(summary["by_email_provider"].items(), key=lambda x: -x[1]):
            print(f"  {provider:25} {count:5} posts")

        print("\n" + "-" * 50)
        print("ISSUES BY PLATFORM")
        print("-" * 50)
        for platform, count in sorted(summary["by_platform"].items(), key=lambda x: -x[1]):
            print(f"  {platform:25} {count:5} posts")

        print("\n" + "-" * 50)
        print("SYNC ISSUES BREAKDOWN")
        print("-" * 50)
        print(f"  Total sync issues: {summary['sync_issues']['total']}")
        print("\n  By Provider:")
        for provider, count in sorted(summary["sync_issues"]["by_provider"].items(), key=lambda x: -x[1]):
            print(f"    {provider:23} {count:5} posts")
        print("\n  By Platform:")
        for platform, count in sorted(summary["sync_issues"]["by_platform"].items(), key=lambda x: -x[1]):
            print(f"    {platform:23} {count:5} posts")

        print("\n" + "-" * 50)
        print("SPECIAL CATEGORIES")
        print("-" * 50)
        print(f"  Quick Fixes:              {summary['quick_fixes_count']:5} posts")
        print(f"  UI Bugs:                  {summary['ui_bugs_count']:5} posts")
        print(f"  OS Integration Issues:    {summary['os_integration_count']:5} posts")

        print("\n" + "-" * 50)
        print("TOP 10 ISSUES BY ENGAGEMENT")
        print("-" * 50)
        for i, post in enumerate(report["top_issues_by_engagement"][:10], 1):
            title = post["title"][:50] + "..." if len(post["title"]) > 50 else post["title"]
            print(f"  {i:2}. [{post['issue_category']:15}] {title}")
            print(f"      Views: {post['views']}, Replies: {post['reply_count']}, "
                  f"Provider: {post['email_provider'] or 'N/A'}, Platform: {post['platform'] or 'N/A'}")

        print("\n" + "-" * 50)
        print("UI BUGS (Sample)")
        print("-" * 50)
        for post in report["ui_bugs"][:10]:
            title = post["title"][:60] + "..." if len(post["title"]) > 60 else post["title"]
            print(f"  - {title}")
            print(f"    {post['url']}")

        print("\n" + "-" * 50)
        print("OS INTEGRATION ISSUES (Sample)")
        print("-" * 50)
        for post in report["os_integration_issues"][:10]:
            title = post["title"][:60] + "..." if len(post["title"]) > 60 else post["title"]
            print(f"  - {title}")
            print(f"    Platform: {post['platform'] or 'N/A'}")
            print(f"    {post['url']}")

        print("\n" + "=" * 70)


def main():
    parser = argparse.ArgumentParser(
        description="Analyze Mailspring Community feedback",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Basic usage
    export DISCOURSE_API_KEY="your-api-key"
    python scripts/analyze-discourse-feedback.py

    # With full content fetching (more accurate but slower)
    python scripts/analyze-discourse-feedback.py --fetch-content

    # Custom output file
    python scripts/analyze-discourse-feedback.py -o my-report.json
        """
    )
    parser.add_argument("--output", "-o", default="mailspring-feedback-report.json",
                        help="Output JSON file path (default: mailspring-feedback-report.json)")
    parser.add_argument("--fetch-content", action="store_true",
                        help="Fetch full post content (slower but more accurate classification)")
    parser.add_argument("--max-pages", type=int, default=50,
                        help="Maximum number of pages to fetch (default: 50)")
    parser.add_argument("--api-key", help="Discourse API key (can also use DISCOURSE_API_KEY env var)")
    args = parser.parse_args()

    print("Mailspring Community Feedback Analyzer")
    print("=" * 40)

    # Check for API key
    api_key = args.api_key or API_KEY
    if not api_key:
        print("\nError: No API key provided.")
        print("Set the DISCOURSE_API_KEY environment variable or use --api-key")
        print("\nExample:")
        print('  export DISCOURSE_API_KEY="your-api-key-here"')
        print("  python scripts/analyze-discourse-feedback.py")
        sys.exit(1)

    # Initialize components
    api = DiscourseAPI(DISCOURSE_BASE_URL, api_key, API_USERNAME)
    classifier = FeedbackClassifier()
    analyzer = FeedbackAnalyzer(api, classifier)

    # Fetch and analyze
    print("\nStarting analysis...")
    analyzer.fetch_all_posts(fetch_content=args.fetch_content, max_pages=args.max_pages)

    # Generate report
    print("\nGenerating report...")
    report = analyzer.generate_report()

    # Save to file
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"\nReport saved to: {args.output}")

    # Print summary
    analyzer.print_summary(report)


if __name__ == "__main__":
    main()
