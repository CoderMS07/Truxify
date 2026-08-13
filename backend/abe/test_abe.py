import unittest
from abe_cipher import CpAbeCipherEngine
from policy_builder import CpAbePolicyBuilder
from abe_core import DecentralizedABE, AccessPolicy


class TestCPABE(unittest.TestCase):
    def setUp(self):
        self.cipher = CpAbeCipherEngine()
        self.builder = CpAbePolicyBuilder()

    def test_encryption_fails_closed(self):
        policy = self.builder.build_trip_document_policy(trip_id="TRIP_1001", allowed_role="Driver")
        doc_data = b"CONFIDENTIAL_BILL_OF_LADING"

        with self.assertRaises(NotImplementedError):
            self.cipher.encrypt_document(doc_data, policy)

    def test_decryption_fails_closed(self):
        policy = self.builder.build_trip_document_policy(trip_id="TRIP_1001", allowed_role="Driver")
        driver_attrs = {"Role: Driver", "TripID: TRIP_1001"}

        with self.assertRaises(NotImplementedError):
            self.cipher.decrypt_document("dGVzdA==", policy, driver_attrs)


class TestMultiAuthority(unittest.TestCase):
    def setUp(self):
        self.dabe = DecentralizedABE()
        self.dabe.add_authority('auth-1', 'public-key-1')
        self.policy = "(Role: Driver AND TripID: TRIP_1001) OR Role: Admin"

    def _issued_attrs(self, *attrs):
        return {"auth-1": {"attributes": list(attrs)}}

    def test_grants_user_with_all_required_attributes(self):
        user = self._issued_attrs("Role: Driver", "TripID: TRIP_1001")
        self.assertTrue(self.dabe._check_multi_authority_attributes(user, self.policy))

    def test_grants_admin_via_second_branch(self):
        user = self._issued_attrs("Role: Admin")
        self.assertTrue(self.dabe._check_multi_authority_attributes(user, self.policy))

    def test_denies_user_missing_a_required_attribute(self):
        user = self._issued_attrs("Role: Driver", "TripID: TRIP_9999")
        self.assertFalse(self.dabe._check_multi_authority_attributes(user, self.policy))

    def test_fails_closed_on_empty_attributes(self):
        self.assertFalse(self.dabe._check_multi_authority_attributes({}, self.policy))
        self.assertFalse(self.dabe._check_multi_authority_attributes(None, self.policy))

    def test_fails_closed_on_malformed_policy(self):
        user = self._issued_attrs("Role: Driver", "TripID: TRIP_1001")
        self.assertFalse(self.dabe._check_multi_authority_attributes(user, None))
        self.assertFalse(self.dabe._check_multi_authority_attributes(user, ""))

    def test_decrypt_fails_closed_for_unauthorized_user(self):
        enc = self.dabe.encrypt(
            "secret",
            AccessPolicy(expression=self.policy, attributes=["Role: Driver", "TripID: TRIP_1001", "Role: Admin"]),
            authorities=["auth-1"],
        )
        self.assertTrue(enc["success"])

        unauthorized = self._issued_attrs("Role: Driver")
        result = self.dabe.decrypt(enc, unauthorized)
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "Insufficient attributes")

        authorized = self._issued_attrs("Role: Driver", "TripID: TRIP_1001")
        result = self.dabe.decrypt(enc, authorized)
        self.assertTrue(result["success"])



class TestPolicyEvaluator(unittest.TestCase):
    def setUp(self):
        self.builder = CpAbePolicyBuilder()

    def test_multi_or_second_branch_grants(self):
        policy = "(Role: Driver AND TripID: TRIP_1001) OR Role: Admin"
        self.assertTrue(self.builder.evaluate_user_attributes({"Role: Admin"}, policy))

    def test_multi_or_first_branch_grants(self):
        policy = "(Role: Driver AND TripID: TRIP_1001) OR Role: Admin"
        self.assertTrue(
            self.builder.evaluate_user_attributes({"Role: Driver", "TripID: TRIP_1001"}, policy)
        )

    def test_multi_or_denies_when_no_branch_satisfied(self):
        policy = "(Role: Driver AND TripID: TRIP_1001) OR Role: Admin"
        self.assertFalse(self.builder.evaluate_user_attributes({"Role: Driver"}, policy))
        self.assertFalse(self.builder.evaluate_user_attributes({"Role: Manager", "TripID: TRIP_9999"}, policy))

    def test_nested_parentheses_and_precedence(self):
        policy = "(Role: Driver OR Role: Manager) AND (TripID: TRIP_1001 OR TripID: TRIP_2001)"
        self.assertTrue(
            self.builder.evaluate_user_attributes({"Role: Manager", "TripID: TRIP_2001"}, policy)
        )
        self.assertFalse(
            self.builder.evaluate_user_attributes({"Role: Manager", "TripID: TRIP_9999"}, policy)
        )

    def test_fails_closed_on_malformed_policy(self):
        self.assertFalse(self.builder.evaluate_user_attributes({"Role: Admin"}, "(Role: Driver AND TripID: TRIP_1001"))
        self.assertFalse(self.builder.evaluate_user_attributes({"Role: Admin"}, "Role: Driver AND AND TripID: X"))
        self.assertFalse(self.builder.evaluate_user_attributes({"Role: Admin"}, "()"))
        self.assertFalse(self.builder.evaluate_user_attributes({"Role: Admin"}, ""))

    def test_fails_closed_on_non_string_policy(self):
        self.assertFalse(self.builder.evaluate_user_attributes({"Role: Admin"}, None))


if __name__ == '__main__':
    unittest.main()
