import unittest
from telegram_user_access_check import classify_urls

class TelegramRetailerLinkTest(unittest.TestCase):
    def test_known_links(self):
        self.assertEqual(classify_urls("https://meli.la/1DhpTm8 https://link.amazon/B08aKs8yN"),["mercadolivre","amazon"])
    def test_spoofed_domain(self):
        self.assertEqual(classify_urls("http://meli.la/x https://meli.la.evil.com/x https://amazon.com.br.evil.com/"),[])
    def test_plain_text(self):
        self.assertEqual(classify_urls("Marinex Opaline por R$90,15 no Pix"),[])
    def test_trailing_punctuation(self):
        self.assertEqual(classify_urls("https://meli.la/2H56Kz8!"),["mercadolivre"])
if __name__=="__main__":
    unittest.main()
