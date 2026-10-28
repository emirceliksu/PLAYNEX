use std::sync::OnceLock;

const WORDS: &str = include_str!("../words.txt");

struct Lists {
    exact: Vec<String>,
    prefix: Vec<String>,
}

fn lists() -> &'static Lists {
    static LISTS: OnceLock<Lists> = OnceLock::new();
    LISTS.get_or_init(|| {
        let mut exact = Vec::new();
        let mut prefix = Vec::new();
        for line in WORDS.lines().map(str::trim) {
            if let Some(word) = line.strip_prefix('=') {
                exact.push(normalize(word));
            } else if let Some(word) = line.strip_prefix('~') {
                prefix.push(normalize(word));
            }
        }
        Lists { exact, prefix }
    })
}

fn fold(ch: char) -> Option<char> {
    let folded = match ch {
        'ş' | 'Ş' | '$' | '5' => 's',
        'ç' | 'Ç' => 'c',
        'ğ' | 'Ğ' => 'g',
        'ü' | 'Ü' => 'u',
        'ö' | 'Ö' | '0' => 'o',
        'ı' | 'İ' | 'I' | '1' | '!' => 'i',
        '3' => 'e',
        '4' | '@' => 'a',
        '7' => 't',
        other if other.is_alphabetic() => other.to_lowercase().next().unwrap_or(other),
        _ => return None,
    };
    Some(folded)
}

// Lowercase, fold look-alikes, drop everything else and collapse runs ("siiiik" -> "sik").
fn normalize(word: &str) -> String {
    let mut out = String::with_capacity(word.len());
    for ch in word.chars().filter_map(fold) {
        if !out.ends_with(ch) {
            out.push(ch);
        }
    }
    out
}

fn offensive(word: &str) -> bool {
    let normalized = normalize(word);
    if normalized.is_empty() {
        return false;
    }
    let lists = lists();
    lists.exact.contains(&normalized)
        || lists
            .prefix
            .iter()
            .any(|w| normalized.starts_with(w.as_str()))
}

/// Masks offensive words with asterisks, keeping spacing and the rest of the message.
pub fn censor(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut word = String::new();
    let flush = |word: &mut String, out: &mut String| {
        if offensive(word) {
            out.extend(std::iter::repeat_n('*', word.chars().count()));
        } else {
            out.push_str(word);
        }
        word.clear();
    };
    for ch in text.chars() {
        if ch.is_whitespace() || matches!(ch, ',' | '.' | '?' | ';' | ':') {
            flush(&mut word, &mut out);
            out.push(ch);
        } else {
            word.push(ch);
        }
    }
    flush(&mut word, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_disguised_words() {
        assert_eq!(censor("siktir git"), "****** git");
        assert_eq!(censor("S1KT1R"), "******");
        assert_eq!(censor("siiiiktir"), "*********");
        assert_eq!(censor("fuuuck this"), "****** this");
    }

    #[test]
    fn leaves_ordinary_words_alone() {
        for text in [
            "sıkıntı yok",
            "götür bunu",
            "mal kaçırma",
            "iyi oyundu, gg",
            "Pickup",
        ] {
            assert_eq!(censor(text), text);
        }
    }
}
