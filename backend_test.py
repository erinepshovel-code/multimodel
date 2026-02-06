#!/usr/bin/env python3

import requests
import json
import sys
import time
from datetime import datetime

class MultiAIChatTester:
    def __init__(self, base_url="https://ai-prompt-hub-35.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.conversation_id = None
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                self.log(f"✅ {name} - Status: {response.status_code}")
                try:
                    return True, response.json() if response.content else {}
                except:
                    return True, {}
            else:
                self.log(f"❌ {name} - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    self.log(f"   Error: {error_detail}")
                except:
                    self.log(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            self.log(f"❌ {name} - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        success, response = self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200
        )
        return success

    def test_user_registration(self):
        """Test user registration"""
        test_username = f"testuser_{int(time.time())}"
        test_password = "TestPass123!"
        
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data={"username": test_username, "password": test_password}
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            self.log(f"   Registered user: {test_username}")
            return True
        return False

    def test_user_login(self):
        """Test user login with existing credentials"""
        # Create a new user for login test
        test_username = f"loginuser_{int(time.time())}"
        test_password = "LoginPass123!"
        
        # First register
        reg_success, reg_response = self.run_test(
            "Registration for Login Test",
            "POST",
            "auth/register",
            200,
            data={"username": test_username, "password": test_password}
        )
        
        if not reg_success:
            return False
            
        # Clear token to test login
        old_token = self.token
        self.token = None
        
        # Now test login
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data={"username": test_username, "password": test_password}
        )
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.log(f"   Logged in user: {test_username}")
            return True
        else:
            # Restore old token if login failed
            self.token = old_token
            return False

    def test_api_key_management(self):
        """Test API key management endpoints"""
        if not self.token:
            self.log("❌ No auth token for API key tests")
            return False
            
        # Test getting keys (should be empty initially)
        success, response = self.run_test(
            "Get API Keys",
            "GET",
            "keys",
            200
        )
        
        if not success:
            return False
            
        # Test setting a custom key
        success, _ = self.run_test(
            "Set Custom API Key",
            "PUT",
            "keys",
            200,
            data={
                "provider": "gpt",
                "api_key": "sk-test-key-12345",
                "use_universal": False
            }
        )
        
        if not success:
            return False
            
        # Test setting universal key
        success, _ = self.run_test(
            "Set Universal Key",
            "PUT",
            "keys",
            200,
            data={
                "provider": "claude",
                "use_universal": True
            }
        )
        
        return success

    def test_chat_streaming(self):
        """Test chat streaming endpoint"""
        if not self.token:
            self.log("❌ No auth token for chat tests")
            return False
            
        # Test streaming with universal key models
        test_data = {
            "message": "Hello, this is a test message. Please respond briefly.",
            "models": ["gpt-5.2"],  # Using GPT with universal key
            "conversation_id": None
        }
        
        self.log("🔍 Testing Chat Streaming...")
        url = f"{self.base_url}/chat/stream"
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(url, json=test_data, headers=headers, stream=True, timeout=60)
            
            if response.status_code != 200:
                self.log(f"❌ Chat Streaming - Status: {response.status_code}")
                self.log(f"   Response: {response.text}")
                return False
                
            # Read streaming response
            chunks_received = 0
            for line in response.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    if line_str.startswith('data:'):
                        chunks_received += 1
                        if chunks_received >= 3:  # Got some chunks, streaming works
                            break
                            
            if chunks_received > 0:
                self.tests_passed += 1
                self.log(f"✅ Chat Streaming - Received {chunks_received} chunks")
                return True
            else:
                self.log("❌ Chat Streaming - No chunks received")
                return False
                
        except Exception as e:
            self.log(f"❌ Chat Streaming - Error: {str(e)}")
            return False
        finally:
            self.tests_run += 1

    def test_conversations(self):
        """Test conversation management"""
        if not self.token:
            self.log("❌ No auth token for conversation tests")
            return False
            
        # Get conversations (should work even if empty)
        success, response = self.run_test(
            "Get Conversations",
            "GET",
            "conversations",
            200
        )
        
        return success

    def test_feedback_endpoint(self):
        """Test message feedback endpoint"""
        if not self.token:
            self.log("❌ No auth token for feedback tests")
            return False
            
        # This will likely fail since we don't have a real message ID
        # But we can test the endpoint structure
        success, response = self.run_test(
            "Submit Feedback (Expected to fail)",
            "POST",
            "chat/feedback",
            404,  # Expecting 404 since message won't exist
            data={
                "message_id": "test-message-id",
                "feedback": "up"
            }
        )
        
        return success

    def run_all_tests(self):
        """Run all tests"""
        self.log("🚀 Starting Multi-AI Chat API Tests")
        self.log(f"   Base URL: {self.base_url}")
        
        tests = [
            ("Root Endpoint", self.test_root_endpoint),
            ("User Registration", self.test_user_registration),
            ("User Login", self.test_user_login),
            ("API Key Management", self.test_api_key_management),
            ("Chat Streaming", self.test_chat_streaming),
            ("Conversations", self.test_conversations),
            ("Feedback Endpoint", self.test_feedback_endpoint),
        ]
        
        for test_name, test_func in tests:
            try:
                result = test_func()
                if not result:
                    self.log(f"⚠️  {test_name} failed")
            except Exception as e:
                self.log(f"💥 {test_name} crashed: {str(e)}")
                
        # Print summary
        self.log("\n" + "="*50)
        self.log(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"📈 Success Rate: {success_rate:.1f}%")
        
        if success_rate >= 70:
            self.log("🎉 Backend API is working well!")
            return 0
        else:
            self.log("⚠️  Backend has significant issues")
            return 1

def main():
    tester = MultiAIChatTester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())