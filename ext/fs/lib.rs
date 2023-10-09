use deno_core::{error::AnyError, op2};

// Read files
#[op2(async)]
#[buffer]
pub async fn op_read_file(#[string] path: String) -> Result<Vec<u8>, AnyError> {
    let contents = tokio::fs::read(path).await?;
    Ok(contents)
}

#[op2(async)]
#[string]
pub async fn op_read_text_file(#[string] path: String) -> Result<String, AnyError> {
    let contents = tokio::fs::read_to_string(path).await?;
    Ok(contents)
}

// Write files
#[op2(async)]
pub async fn op_write_file(
    #[string] path: String,
    #[buffer(copy)] contents: Vec<u8>,
) -> Result<(), AnyError> {
    tokio::fs::write(path, contents).await?;
    Ok(())
}

#[op2(async)]
pub async fn op_write_text_file(
    #[string] path: String,
    #[string] contents: String,
) -> Result<(), AnyError> {
    tokio::fs::write(path, contents).await?;
    Ok(())
}

// Remove files
#[op2(async)]
pub async fn op_remove_file(#[string] path: String) -> Result<(), AnyError> {
    tokio::fs::remove_file(path).await?;
    Ok(())
}

#[op2(async)]
pub async fn op_remove_dir(#[string] path: String, recursive: bool) -> Result<(), AnyError> {
    if recursive {
        tokio::fs::remove_dir_all(path).await?;
    } else {
        tokio::fs::remove_dir(path).await?;
    }

    Ok(())
}

#[op2(async)]
pub async fn op_copy_file(#[string] origin: String, #[string] dest: String) -> Result<(), AnyError> {
    tokio::fs::copy(origin, dest).await?;
    Ok(())
}

#[op2(async)]
pub async fn op_copy_dir(#[string] origin: String, #[string] dest: String) -> Result<(), AnyError> {
    op_copy_dir_recurse(origin, dest).await?;
    Ok(())
}

use async_recursion::async_recursion;
#[async_recursion]
pub async fn op_copy_dir_recurse(origin: String, dest: String) -> Result<(), AnyError> {

    // Setup for viewing directory contents and checking if dir
    let orgForMetadata = origin.clone();
    let attr = tokio::fs::metadata(orgForMetadata);
    let dirBool = attr.await?.is_dir();

    // if directory, make a directory at destination and loop through contents
    if dirBool {  

        // Make a new directory at destination
        let destForCreate = dest.clone();
        tokio::fs::create_dir(destForCreate).await?;

        // Loop through all contents of folder
        let mut entries = tokio::fs::read_dir(origin).await?;
        while let Some(entry) = entries.next_entry().await? {

            // Take name of file and add to destination path
            let wholePathStr = entry.path().into_os_string().into_string().unwrap().clone();
            let parts = wholePathStr.split("/");
            let itemStr = parts.last().unwrap();
            let mut next = dest.to_owned();
            next.push_str(&"/");
            next.push_str(&itemStr);

            // Recursive call to copy over contents of folder being looked at
            op_copy_dir_recurse(entry.path().into_os_string().into_string().unwrap(), next).await?;
        }

    // If file, copy file over to destination
    } else {
        tokio::fs::copy(origin, dest).await?;
    }
    Ok(())
}

#[op2(async)]
pub async fn op_move_file(#[string] origin: String, #[string] dest: String) -> Result<(), AnyError> {
    tokio::fs::rename(origin, dest).await?;
    Ok(())
}

#[op2(async)]
pub async fn op_move_folder(#[string] origin: String, #[string] dest: String) -> Result<(), AnyError> {
    tokio::fs::rename(origin, dest).await?;
    Ok(())
}