"""
Test script for Driver Scheduling Upload System
Run this to test the upload endpoint with a sample file
"""

import requests
import json
from datetime import date

# Configuration
API_BASE_URL = "http://localhost:8000"
EXCEL_FILE_PATH = "sample_weekly_plan.xlsx"  # Replace with your file path
WEEK_START = "2025-07-07"  # Monday

# Optional: Manually set unavailable drivers
unavailable_drivers = [
    {
        "driver_name": "Merz, Matthias",
        "dates": ["2025-07-07", "2025-07-08"],
        "reason": "Vacation"
    },
    {
        "driver_name": "Grandler, Hermann",
        "dates": ["2025-07-07", "2025-07-08", "2025-07-09"],
        "reason": "Sick Leave"
    }
]


def test_health():
    """Test health endpoint"""
    print("🔍 Testing health endpoint...")
    response = requests.get(f"{API_BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}\n")


def test_upload():
    """Test upload endpoint"""
    print("📤 Testing upload endpoint...")
    
    # Prepare form data
    files = {
        'file': open(EXCEL_FILE_PATH, 'rb')
    }
    
    data = {
        'week_start': WEEK_START,
        'action': 'replace',  # or 'append'
        'unavailable_drivers': json.dumps(unavailable_drivers)
    }
    
    # Make request
    response = requests.post(
        f"{API_BASE_URL}/api/v1/upload/weekly-plan",
        files=files,
        data=data
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print("✅ Upload successful!")
        print(f"Week Start: {result['week_start']}")
        print(f"Season: {result['season']}")
        print(f"School Status: {result['school_status']}")
        print(f"Records Created:")
        for key, value in result['records_created'].items():
            print(f"  - {key}: {value}")
    else:
        print("❌ Upload failed!")
        print(f"Error: {response.text}")
    
    print()


def test_get_routes():
    """Test get routes endpoint"""
    print("🛣️  Testing get routes endpoint...")
    response = requests.get(
        f"{API_BASE_URL}/api/v1/weekly/routes",
        params={'week_start': WEEK_START}
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Found {len(result['routes'])} routes")
        print(f"Season: {result['season']}")
        print(f"School Status: {result['school_status']}")
        
        # Show first 3 routes
        if result['routes']:
            print("\nSample Routes:")
            for route in result['routes'][:3]:
                print(f"  - {route['date']} ({route['day_of_week']}): {route['route_name']}")
    else:
        print("❌ Failed to get routes")
        print(f"Error: {response.text}")
    
    print()


def test_get_drivers():
    """Test get drivers endpoint"""
    print("👥 Testing get drivers endpoint...")
    response = requests.get(
        f"{API_BASE_URL}/api/v1/weekly/drivers",
        params={'week_start': WEEK_START}
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Found {len(result['drivers'])} drivers")
        
        # Show first 3 drivers
        if result['drivers']:
            print("\nSample Drivers:")
            for driver in result['drivers'][:3]:
                details = driver['details']
                print(f"  - {driver['name']}")
                print(f"    Monthly Hours: {details.get('monthly_hours_target', 'N/A')}")
                print(f"    Remaining: {details.get('remaining_hours_this_month', 'N/A')}")
    else:
        print("❌ Failed to get drivers")
        print(f"Error: {response.text}")
    
    print()


def test_get_availability():
    """Test get availability endpoint"""
    print("📅 Testing get availability endpoint...")
    response = requests.get(
        f"{API_BASE_URL}/api/v1/weekly/availability",
        params={'week_start': WEEK_START}
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Found {len(result['availability'])} availability records")
        
        # Count unavailable
        unavailable = [a for a in result['availability'] if not a['available']]
        print(f"Unavailable instances: {len(unavailable)}")
        
        # Show first 3 unavailable
        if unavailable:
            print("\nSample Unavailability:")
            for avail in unavailable[:3]:
                print(f"  - {avail['date']}: {avail.get('notes', 'No reason')}")
    else:
        print("❌ Failed to get availability")
        print(f"Error: {response.text}")
    
    print()


def test_get_summary():
    """Test get summary endpoint"""
    print("📊 Testing get summary endpoint...")
    response = requests.get(
        f"{API_BASE_URL}/api/v1/weekly/summary",
        params={'week_start': WEEK_START}
    )
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print("✅ Summary retrieved successfully!")
        print(f"Season: {result['season']}")
        print(f"School Status: {result['school_status']}")
        print("\nStatistics:")
        for key, value in result['statistics'].items():
            print(f"  - {key}: {value}")
    else:
        print("❌ Failed to get summary")
        print(f"Error: {response.text}")
    
    print()


if __name__ == "__main__":
    print("=" * 50)
    print("Driver Scheduling Upload System - Test Script")
    print("=" * 50)
    print()
    
    # Run tests
    try:
        test_health()
        test_upload()
        test_get_routes()
        test_get_drivers()
        test_get_availability()
        test_get_summary()
        
        print("=" * 50)
        print("✅ All tests completed!")
        print("=" * 50)
    
    except FileNotFoundError:
        print(f"❌ Error: Excel file not found at {EXCEL_FILE_PATH}")
        print("Please update EXCEL_FILE_PATH in the script")
    
    except requests.exceptions.ConnectionError:
        print(f"❌ Error: Cannot connect to {API_BASE_URL}")
        print("Make sure the backend is running: python main.py")
    
    except Exception as e:
        print(f"❌ Unexpected error: {e}")