import ast
import glob
import hashlib
import hmac
import os
import re
import secrets
import unittest


def pbkdf2_hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000,
    ).hex()
    return f"pbkdf2_sha256$100000${salt}${derived}"


def pbkdf2_verify_password(plain_password: str, stored_hash: str) -> bool:
    parts = stored_hash.split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return False
    iterations = int(parts[1])
    salt = parts[2]
    expected_digest = parts[3]
    computed = hashlib.pbkdf2_hmac(
        "sha256",
        plain_password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    ).hex()
    return hmac.compare_digest(computed, expected_digest)


class TestSecurityAndHashing(unittest.TestCase):
    def test_pbkdf2_password_hash_and_verification(self) -> None:
        raw_secret = "EnterpriseSecretPass2026"
        digest = pbkdf2_hash_password(raw_secret)
        self.assertTrue(digest.startswith("pbkdf2_sha256$100000$"))
        self.assertTrue(pbkdf2_verify_password(raw_secret, digest))
        self.assertFalse(pbkdf2_verify_password("WrongPassword", digest))
        self.assertFalse(pbkdf2_verify_password(raw_secret, "invalid_format_hash"))

    def test_security_module_uses_pbkdf2_hmac_sha256(self) -> None:
        with open("app/security.py", "r", encoding="utf-8") as handle:
            security_src = handle.read()
        self.assertIn("pbkdf2_hmac", security_src)
        self.assertIn("compare_digest", security_src)
        self.assertIn("pbkdf2:sha256:100000", security_src)


class TestTemplateAndApplicationContracts(unittest.TestCase):
    def test_purchase_modal_does_not_autoselect_succeed_card(self) -> None:
        with open("app/templates/base.html", "r", encoding="utf-8") as handle:
            base_html = handle.read()
        self.assertIn("purchaseCardOption: ''", base_html)
        self.assertIn("this.purchaseCardOption = '';", base_html)
        self.assertNotIn("this.purchaseCardOption = 'XXX-1234 SUCCEED'", base_html)

        with open("app/templates/partials/purchase_modal.html", "r", encoding="utf-8") as handle:
            modal_html = handle.read()
        self.assertIn('<input type="hidden" name="card_option" :value="purchaseCardOption">', modal_html)
        self.assertIn('<option value="" disabled>-- Select a Bank Card --</option>', modal_html)
        self.assertIn('<option value="XXX-1234 SUCCEED">XXX-1234 SUCCEED</option>', modal_html)
        self.assertIn('<option value="XXX-1111 REJECTED">XXX-1111 REJECTED</option>', modal_html)
        self.assertIn(':disabled="purchaseButtonDisabled || !purchaseCardOption"', modal_html)

    def test_sample_csv_restricted_to_admin_in_templates(self) -> None:
        with open("app/templates/index.html", "r", encoding="utf-8") as handle:
            index_html = handle.read()
        pattern = re.compile(
            r"\{%\s*if\s+current_user\s+and\s+current_user\.role\s*==\s*'admin'\s*%\}.*?Sample CSV.*?\{%\s*endif\s*%\}",
            re.DOTALL,
        )
        self.assertIsNotNone(pattern.search(index_html))

    def test_admin_multicolumn_filters_present(self) -> None:
        with open("app/templates/admin.html", "r", encoding="utf-8") as handle:
            admin_html = handle.read()
        for col_key in ("filterSku", "filterName", "filterCategory", "filterPrice", "filterStock", "filterWeight"):
            self.assertIn(col_key, admin_html)

    def test_order_model_and_payment_rejected_exception_present(self) -> None:
        with open("app/models.py", "r", encoding="utf-8") as handle:
            models_src = handle.read()
        self.assertIn("class Order(Base):", models_src)
        self.assertIn('__tablename__ = "orders"', models_src)
        self.assertIn("def card_option(self) -> str:", models_src)

        with open("app/schemas.py", "r", encoding="utf-8") as handle:
            schemas_src = handle.read()
        self.assertIn("card_option: str", schemas_src)
        self.assertIn("payment_card: str", schemas_src)

        with open("app/services.py", "r", encoding="utf-8") as handle:
            services_src = handle.read()
        self.assertIn("class PaymentRejectedException", services_src)
        self.assertIn("class OrderService:", services_src)
        self.assertIn("card_option=normalized_card", services_src)

    def test_python_ast_and_zero_comments_policy(self) -> None:
        py_files = glob.glob("app/**/*.py", recursive=True) + glob.glob("tests/**/*.py", recursive=True)
        self.assertGreater(len(py_files), 5)
        for path in py_files:
            if not os.path.isfile(path):
                continue
            with open(path, "r", encoding="utf-8") as handle:
                source = handle.read()
            ast.parse(source, filename=path)
            for line_num, line in enumerate(source.splitlines(), start=1):
                stripped = line.strip()
                self.assertFalse(
                    stripped.startswith("#"),
                    f"Inline comment found in {path} at line {line_num}",
                )


if __name__ == "__main__":
    unittest.main()
