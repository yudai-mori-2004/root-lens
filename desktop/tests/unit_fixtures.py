ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def unit_id(index=0, site="fixture"):
    value = index
    suffix = ""
    for _ in range(8):
        suffix = ALPHABET[value % len(ALPHABET)] + suffix
        value //= len(ALPHABET)
    if value:
        raise ValueError("fixture index is too large")
    return f"unit_{site}_20260911T010203000Z_{suffix}"
