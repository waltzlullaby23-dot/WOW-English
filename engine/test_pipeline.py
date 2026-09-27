from common import language_ratios,text_fingerprint,lexical_similarity,cosine
assert language_ratios('Hello, this is English')['english']>.9
assert text_fingerprint('hello world')==text_fingerprint('hello world')
assert lexical_similarity('learn English vocabulary','learn English grammar')>0.3
assert cosine([1,0],[1,0])==1.0
print('pipeline unit tests: PASS')
